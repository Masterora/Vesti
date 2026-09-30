# 迭代 2：Web 链上争议闭环详细设计

## 1. 状态、基线与交付目标

本文是实施设计，尚未代表功能已实现或验收通过。基线为 `f436ad4f277229525b03976f00d5fc53176662bb`：迭代 1 的链上争议指令、创建前争议方式选择及评审修复已提交；该提交的 GitHub CI `36546227960` 已通过 `verify` 和 `onchain`。Devnet 程序尚未升级到该版本。

产品规则继承[迭代 1 详细设计](iteration-1-onchain-dispute-design.zh-CN.md)：默认双方协商；创建前可以指定独立仲裁钱包；注资后不可改变方式。双方协商没有自动解冻保证，指定仲裁人也没有失联后的自动退出机制。

**本轮交付**：在本地验证器上，通过浏览器、钱包签名、真实 API 和 PostgreSQL，完成发起、提议、接受或仲裁、释放或退款；服务重启后能恢复；直接链上操作能被发现并核对，无法可靠解释的操作隔离合约。

范围包含现有注资和普通付款的交易恢复改造，因为它们与争议共享同一合约余额。保留 Mock 模式。无需修改迭代 1 的 Rust 指令或已发布账户布局。Devnet 部署、正式钱包兼容性矩阵、生产运维和独立安全审查分别留在后续迭代。

## 2. 当前代码与必须补齐的缺口

| 位置 | 当前行为 | 本轮改变 |
| --- | --- | --- |
| `components/wallet/wallet-provider.tsx` | 广播后才执行保存签名回调；使用签名确认 | 签名持久化成功后才广播；保存区块高度有效期 |
| `lib/services/transactions/escrow-transactions.ts` | 按 action、milestone 排他 | 所有改变资金或争议状态的操作共用合约锁 |
| `lib/services/transactions/submit-escrow-transaction.ts` | 只支持 fund/release；接收客户端签名 | 校验完整签名交易与准备消息，服务端推导签名 |
| `lib/blockchain/solana-escrow-reconciliation.ts` | 以 confirmed 验证；要求当前账户等于某笔旧交易结果 | finalized 后推进业务；按链上顺序重放，核对最终聚合状态 |
| `scripts/reconcile-escrow-transactions.ts` | 只处理 submitted fund/release；租约失败路径有 CAS | 覆盖全部 kind 和 signed/confirmed；成功投影也检查租约 |
| `prisma/schema.prisma` | Dispute 没有链上版本、金额、账户信息 | 明确争议投影、链上证据与隔离状态 |
| `app/api/runtime/public-config/route.ts` | 链上争议按钮关闭；只按 adapter 判断能力 | 按配置、网络、程序版本和服务能力开放 |
| 合约页面与仲裁人过滤器 | Mock 争议入口；仲裁人不能读完整交易列表 | 接入链上动作，提供仲裁人本人待恢复交易的最小 DTO |
| 交付、批准、修改、取消与工作者指派服务 | 未统一取得 Contract 行锁，部分更新只按 id 写入 | 纳入统一业务锁、锁内复查和 businessRevision 协议 |
| 数据库集成测试运行器 | 强制 Mock | 增加独立本地验证器 + 数据库 + 浏览器验收 |

## 3. 必须成立的约束

1. `building/prepared/signed/submitted/confirmed` 均不代表业务完成；只有 finalized 交易证据通过校验，才改变业务状态与账本。
2. 同一合约最多一个应用内未终结操作；签名可能落链时，不能因租约超时或用户关页面释放锁。
3. 交易的网络、程序、账户、金额、提议版本和钱包角色由服务端准备；客户端不能提供可直接采信的结算金额。
4. 签名交易先持久化，再广播；重试只广播同一份字节。未知结果不能重新签另一笔交易。
5. 合约锁只能限制应用内并发；程序约束与链上扫描负责处理应用外并发。
6. 旧交易的成功必须由其自身证据证明，不能要求当前账户仍停留在旧交易执行后的状态。
7. 数据库账本只保存已经验证的本金变化。观察到但未解释的链上变化单独展示，不伪造里程碑完成。
8. 仲裁人只能取得履职与恢复本人操作所需的数据；申请者、私密留言和无关交易材料仍不可见。
9. 所有改变合约、里程碑业务状态或交易绑定字段的写入统一取得 Contract 行锁；取得锁后重新读取并验证，禁止使用锁前状态继续更新。
10. building 阶段不向客户端返回任何可签名消息；完整消息、有效期和 prepared 状态必须原子持久化后才能发布。

## 4. 角色、业务状态与操作

### 4.1 操作矩阵

| 操作 | 发起者 | 业务前置条件 | finalized 后的投影 |
| --- | --- | --- | --- |
| open | 需求方或工作者 | active；里程碑 ready/submitted/revision_requested/approved；无其他争议 | 保存原里程碑状态；里程碑和合约 disputed |
| propose | 任一参与方 | 争议 unresolved；版本与链上最新版本相同 | 更新提出者、结果、金额和 proposalVersion |
| accept_release | 最新提议的对方 | 未解决；结果 release；版本匹配 | 按已验证金额付款；争议 resolved；更新合约与里程碑 |
| accept_refund | 最新提议的对方 | 未解决；结果 refund；版本匹配 | 退还全部剩余本金；合约 cancelled；争议 resolved |
| arbitrate_release | 创建前指定的仲裁钱包 | arb policy；未解决 | 按里程碑金额释放；争议 resolved |
| arbitrate_refund | 创建前指定的仲裁钱包 | arb policy；未解决 | 退还全部剩余本金；合约 cancelled；争议 resolved |

双方可在两种 policy 下提出和接受方案。仲裁操作不要求已有提议，但必须绑定指定钱包。链上程序允许的部分金额不自动成为 Web 支持范围：Web release 固定为该里程碑面值；refund 固定为全部剩余本金。

接受与仲裁的金额或版本若在准备后被直接链上操作改变，原交易由程序拒绝或进入结果核查；页面刷新最新状态后才能准备下一笔。

### 4.2 金额与完成状态

所有 API 金额使用十进制字符串；链上原始单位和 u64 版本使用字符串传输、BigInt 计算，禁止 JavaScript Number。经典 USDC Mint 必须核对 decimals=6，数据库 Decimal 与原始单位精确转换。

设本金 F，已释放 R，已退款 Q；本金可支取余额为 `F-R-Q`。release 增加 R，refund 将 Q 设置为原剩余本金。退款后本金余额为 0，即使金库有外部转入的额外 Token，也不能重复退款。

正常 Web 争议释放等于里程碑面值，沿用已验证的里程碑完成规则；尚有应付里程碑则 active，全部完成且本金账本一致则 completed。退款后其他里程碑保留原状态作为历史，但所有操作由 cancelled 阻止，页面不再显示可执行交付或付款动作。

## 5. 数据模型和迁移

采用新增迁移，禁止改写已经提交的迁移。以下为逻辑字段，实施时统一与现有命名风格对齐。

### 5.1 EscrowTransaction

保留现有 action，新增 `kind` 枚举：`fund / release / dispute_open / dispute_propose / dispute_accept_release / dispute_accept_refund / dispute_arbitrate_release / dispute_arbitrate_refund`。

兼容映射：open/propose → dispute；争议 release → resolve；争议 refund → refund。新代码一律按 kind 分派，不再猜测 action 的含义。

| 新字段 | 用途 |
| --- | --- |
| kind、contextVersion | 明确执行类型及上下文格式版本 |
| operationContext JSON | 不可变的角色、PDA、hash、policy、版本、结果、原始金额、账本基线、网络与程序标识 |
| contractLockKey String? unique | 持锁时等于 contractId；终结后置 null |
| signedTransaction、signedAt | 完整已签名交易字节及持久化时间 |
| buildToken、buildExpiresAt | building 的执行标识与构建期限；用于拒绝过期构建进程的写入 |
| messageHash、lastValidBlockHeight | 准备消息摘要和有效期；recentBlockhash 继续保存 |
| finalizedSlot、finalizedTransactionIndex | 对应交易的已验证位置 |

新增状态 `building` 和 `signed`；新操作以 building 创建，prepared 必须拥有完整交易消息、messageHash、recentBlockhash 和 lastValidBlockHeight。现有 confirmed 只表示网络观察结果。签名交易字节有执行能力，受服务端权限保护，不进入通用合约 DTO、浏览器日志或事件内容。open 的明文原因暂存在受保护上下文中，成功投影后写 Dispute；公开页面不展示待执行原因。

`operationKey`：fund/release 沿用现有键；open 使用 `open:{milestoneId}`；propose 使用 `propose:{disputeId}:{nextVersion}`；所有接受和仲裁共享 `settle:{disputeId}`。新增 `logicalOperationKey` 与 `attempt` 字段；上述键为 logicalOperationKey，实际唯一 operationKey 使用 `{logicalOperationKey}:attempt:{attempt}`。旧记录回填 logicalOperationKey=原 operationKey、attempt=0，保留原 operationKey 不改写。终结失败后，在 Contract 行锁内分配下一个 attempt，创建新记录并使用新的 idempotencyKey；旧失败记录及签名保持不变。增加 `(logicalOperationKey, attempt)` 唯一约束。settle 成功后不允许新 attempt；失败后只有完成链上核查和释放合约锁才允许重试。

同一个 idempotencyKey 首先查询既有记录：相同钱包、kind 和上下文返回原操作；不同参数返回冲突。重试查询应早于“当前已完成”等业务拒绝判断。

### 5.2 Dispute 与 Contract

Dispute 新增：`source(web/chain)`、`chainAddress`、`milestoneHash`、`reasonHash`、`proposalVersion`、`proposedAmountUnits`、`settledAmountUnits`、`resolvedBy`、`resolutionKind`。原 reason 改为 nullable：直接链上发起只有 hash，页面显示“链上发起，未提供文字原因”，不能推测明文。

Contract 新增：`chainReviewAt/code/evidence`、`chainSyncStatus`、`chainLastSyncedSlot/TransactionIndex/InstructionIndex`、`chainBaselineKind`、`chainBaselineEvidence`、`businessRevision`（BigInt，迁移默认 0）。chainBaselineKind 为 absent/initialized/funded；funded 表示已发生注资，包含其后 disputed/completed/cancelled 阶段，具体业务状态另行重放；chainBaselineEvidence 保存网络、账户读取 context 与已验证历史头，不能只用空游标证明未初始化。状态包含 uninitialized、synced、degraded、review。网络错误短期重试为 degraded；确定的数据冲突、不可解释操作或历史缺口为 review。两者均阻止新的链上操作，不覆盖现有业务状态。

### 5.3 链上证据表

新增 `ChainAppliedInstruction`：networkGenesisHash、programId、contractId、txSig、slot、transactionIndex、instructionIndex、kind、规范化参数、证据摘要、appliedAt。唯一键为 `(networkGenesisHash, programId, txSig, instructionIndex)`；一笔 fund 可含初始化和注资两条指令，不能只按签名去重。

账本更新、证据插入、业务事件、Tx reconciled 和锁释放在同一数据库事务内完成。事件携带证据唯一键，重跑不重复生成事件或支付记录。

### 5.4 旧数据升级

- 旧 onchain fund/release 可确定 kind；Mock 记录保持原有行为。
- 旧 prepared 不自动转换为 building：旧接口是否曾发布消息无法由空字段单独证明。完整消息可恢复的记录走有效期与历史核查；消息或有效期缺失则保留锁进入 review，通过旧接口审计和链上核查后决定终结，不能套用新 building 的自动解锁规则。
- 旧 submitted/confirmed 保留签名，重新验证历史；不假设已有 DB 状态就是有效扫描基线。
- 同一合约已有多个未终结操作：全部标记需核查，最早记录占 contractLockKey，合约 review；保留其余签名和证据，禁止自动挑一笔忽略其他。
- 已注资合约首次同步从初始化/注资交易重建历史，与数据库比对；缺少完整证据则 review，不默认标为 synced。
- 迁移增加 nullable 字段后执行可重跑回填，最后开启功能。回退先关入口和暂停新准备；已有 signed 交易仍可落链，必须继续运行兼容对账器，不能直接删列回滚。

## 6. API 与不可变交易上下文

建议路径按现有路由结构落地，以下定义请求契约。

| API | 请求 | 返回与权限 |
| --- | --- | --- |
| POST `/api/contracts/:id/disputes/prepare` | milestoneId、kind、reason（仅 open）、expectedProposalVersion（propose/accept）、outcome（propose）、idempotencyKey | 本人会话；服务端检查角色；返回 txId、preparedTransaction、messageHash、有效期、操作摘要 |
| POST `/api/escrow-transactions/:id/record-signed` | signedTransaction | 本人操作；校验后返回服务端推导的 txSig 和持久化状态 |
| POST `/api/escrow-transactions/:id/submitted` | txSig | 同一操作者；只确认广播提示，不改变业务 |
| POST `/api/escrow-transactions/:id/confirm` | txSig | 同一操作者；触发验证，返回状态或待恢复；fund/release 同步迁移 |
| GET `/api/escrow-transactions/:id/status` | 无 | 同一操作者最小状态 DTO；不返回签名字节或 reason |
| POST `/api/contracts/:id/chain-sync` | 无 | 参与方或指定仲裁人；限流并触发合约同步 |

prepare 的 accept 根据最新链上提议确定 outcome，不接受客户端金额或覆盖结果；arbitrate 使用 kind 确定 outcome。propose 的 nextVersion 由服务端从已核对版本加一，客户端 expectedProposalVersion 仅用于拒绝陈旧页面。

准备上下文至少固定：contractId、milestoneId/hash、dispute PDA、escrow/policy/vault、Mint/Token Program、收款 ATA、actor wallet/角色、policy mode/仲裁钱包、reasonHash、outcome、当前/下一版本、金额、F/R/Q、genesisHash、programId 和批准的程序版本。

状态码：401 未登录；403 角色不符；409 并发锁、版本变化或幂等参数冲突；422 无效业务输入/签名消息；503 网络、程序能力或同步不可用。重复 confirm 已完成返回 200；仍等待返回 202。对外错误 DTO 用稳定 code 和简短可操作说明，内部 RPC/SQL 细节只写脱敏日志。

### 6.1 指令构建映射

| kind | 现有 Anchor 指令 | 固定参数 |
| --- | --- | --- |
| dispute_open | open_dispute | milestone_id、milestone hash、reason hash |
| dispute_propose | propose_resolution | outcome、release 面值或 refund 的 0、expected_current_version |
| dispute_accept_release | accept_release_resolution | expected_proposal_version、expected_amount=里程碑面值 |
| dispute_accept_refund | accept_refund_resolution | expected_proposal_version、expected_refund_amount=剩余本金 |
| dispute_arbitrate_release | arbitrate_release_resolution | amount=里程碑面值 |
| dispute_arbitrate_refund | arbitrate_refund_resolution | expected_refund_amount=剩余本金 |

退款提议的链上 proposed_amount 固定为 0，这是全部剩余本金退款的编码；页面从 F-R-Q 推导展示金额。accept_refund/arbitrate_refund 的 expected_refund_amount 才是实际剩余本金。operationContext 分开保存 instructionAmountUnits 与 expectedSettlementAmountUnits，不能将展示金额错填入 propose 指令。

构建器依据现有 IDL/指令布局生成参数与 account metas，收款 ATA 必须属于正确参与方；创建 ATA 使用确定的幂等指令。精确账户顺序、可写及签名标志纳入消息校验夹具，页面不自行拼装。

## 7. 准备、签名与持久化协议

### 7.1 服务端准备

1. 身份验证、读取幂等记录。prepared 或更后阶段返回对应恢复状态；同参数 building 返回 202 与 txId，不返回消息、不创建第二条记录；failed 返回原失败状态并提示使用新幂等键；参数不一致返回 409。
2. 校验全局功能开关、网络 genesis、程序版本、Mint 和角色。
3. 在数据库事务外完成 finalized 同步，按第 8.5 节区分首次注资和已有账户；网络不可靠时拒绝新准备。保留业务 revision 与链上游标，用于提交时复查。
4. 数据库事务内锁定 Contract 行，重新读取合约、里程碑与争议；核对 businessRevision 和扫描游标未改变、非 degraded/review、无合约锁，再复查业务条件。创建 building 操作，固定 operationContext，占 contractLockKey，分配随机 buildToken，buildExpiresAt 默认数据库时间加 2 分钟。
5. 在事务外构建未签名交易。新事务按同一顺序取得 Contract 行锁，再用 `id + status=building + buildToken + buildExpiresAt>数据库当前时间 + contractLockKey=contractId` 作 CAS，复查业务 revision、游标及 review 状态。一次提交完整消息、摘要、blockhash、lastValidBlockHeight 和 status=prepared。CAS 失败则丢弃内存交易，不返回客户端、不广播。
6. 只有步骤 5 提交成功才返回可签名消息。响应丢失后，幂等查询返回已持久化的同一 prepared 消息。构建失败的终结也必须使用相同 buildToken 和状态 CAS；不能覆盖已进入 prepared/signed 的记录。

RPC 读取不能长时间占数据库锁。准备期间非链上业务状态操作按第 9.1 节由合约 pending 门禁阻止；链上外部变化仍由程序与对账验证。若发现外部变化，先同步再决定是否重建，不能改变已发布的消息。

#### 7.1.1 building 崩溃恢复

新协议保证 building 没有对客户端发布消息、没有签名，也没有广播。构建器不流式输出交易、不提前缓存到客户端，不在构建过程中发送交易。恢复器在数据库时间超过 buildExpiresAt 后，取得 Contract 行锁，用 status/buildToken/过期时间/锁所有权 CAS，将其置 failed，errorCode=BUILD_INTERRUPTED 并清除 contractLockKey；这一步不要求不存在的 blockhash 过期证明。

CAS 与构建完成提交互斥：完成先提交则恢复器看见 prepared，必须走正常过期核查；恢复先提交则旧构建器失去写入资格，不能再返回消息。超时后新请求使用新 idempotencyKey 和 attempt 创建 building。操作上下文与失败记录保留审计。building 自动恢复只解除本操作锁，不能清除已经存在的合约 review；下一次 prepare 仍必须重新同步。

### 7.2 钱包流程

`prepare → sign → record-signed → sendRawTransaction(相同字节) → submitted → observe → confirm/reconcile`。

- 签名前明确钱包角色、操作、收款人、金额和退款范围；钱包拒签不更改业务状态。
- 签名完成后浏览器先保存待恢复材料，再调用 record-signed；该请求未成功时不广播。
- 服务端检查完整消息等于准备消息、签名有效、payer/required signer 正确；从签名推导 txSig。只接受已保存的同一份消息，不允许新增转账指令。
- record-signed 取得 Contract 行锁后，仅可通过 status=prepared 且本记录仍持有 contractLockKey 的 CAS 转为 signed，并复查合约没有新核查阻断。building/failed 禁止签名登记；signed 或更后状态的相同字节可幂等查询，不同字节或签名返回冲突。服务端持久化后才允许广播。
- 浏览器保存按 genesisHash、programId、contractId、wallet 隔离的恢复数据；保留所有非终结项，不再以“仅最后 20 条”丢弃未完成项。完成后删除，断开/切换钱包不跨钱包读取。
- record-signed 响应丢失时查询状态或重传同一字节；数据库已有 signed，后台可广播。页面关闭后不依赖浏览器在线。
- 服务端广播只发送已验证字节，不持有用户私钥。重复发送同一签名不创建第二笔业务操作。

钱包提交失败不等于链上失败；confirm 采用 blockhash + lastValidBlockHeight 策略展示进展，业务提交仍以 finalized 历史验证为准。

## 8. 链上验证与合约同步

### 8.1 发现范围和顺序

对 escrow 地址调用 finalized `getSignaturesForAddress`，分页到已有游标，再按旧到新处理。该 RPC 返回引用该地址的交易，且按新到旧排列；不能假设每笔都是资金操作。[RPC 定义](https://solana.com/docs/rpc/http/getsignaturesforaddress)

同一个 slot 内使用 `getBlock` 的交易位置确定 transactionIndex，不能按签名字典顺序排序；交易内按 instructionIndex 处理。[getBlock](https://solana.com/docs/rpc/http/getblock)

扫描 policy、escrow、金库、已知 receipt，并通过 `getProgramAccounts` 搜索全部 DisputeState：discriminator、dataSize=227、escrow offset=8 过滤，再验证 owner、PDA 和完整字段。不能只枚举数据库已有 milestone PDA，否则发现不了陌生 hash 的争议。[账户过滤接口](https://solana.com/docs/rpc/http/getprogramaccounts)

### 8.2 校验内容

- 交易 finalized 且 meta.err 为空；程序 ID、指令 discriminator、账户角色和参数符合预期。
- Web 交易完整消息符合准备结果，允许的 envelope 仅包含构建器明确生成的 ATA 创建、固定 ComputeBudget 配置和预期 escrow 指令；fund 的初始化/注资组合单独定义。
- Token 转账证据核对金库、收款账户、owner、Mint、经典 Token Program、原始金额及成功 CPI；缺失 metadata 或无法解释的额外资金转移不推测成功。
- PDA、policy、提议版本、receipt 与重放结果一致。读取当前账户用于检查最终聚合结果，不作为某笔旧交易的唯一成功证明。
- 所有受支持直接链上指令也按同样规则验证。应用外的一笔交易包含多次 escrow 操作，或通过未知 CPI 路径调用 escrow，本轮进入 review；不能只挑出其中一条接受。仅引用账户而没有 escrow 执行且没有异常资金变化的交易可以跳过。

### 8.3 历史重放和快照一致性

从可证明的初始化基线重放 F/R/Q、争议开启/提议版本/解决、receipt 和 policy。旧交易已成功而后来又发生提议或付款时，先证明旧交易，再将最终投影推进到最新状态；不能把旧操作误判为失败。

链上查询没有跨账户原子快照。`minContextSlot` 是读取下限，不能当作历史快照。同步采用有界收敛：记录 finalized 相关历史头，读取带 context 的账户并要求不早于该头，再重读历史头；若新增相关交易或账户结果与重放不一致，扩大范围重试。连续无法收敛则 degraded，停止准备。历史被裁剪、缺块、分页未覆盖基线或排序证据缺失则 review，不跳过空洞。

同步成功前核对 escrow 聚合本金、policy、全部争议账户和已知 receipt。金库余额应至少覆盖剩余本金；允许外部额外 Token，单独记为额外余额，不把它计入本金或可退款金额。若余额小于本金需求则 review。

确认某笔操作与推进合约同步分开记录：自身成功证据可以保存；只有整段扫描与聚合核对成立才投影业务和释放操作锁。若同批存在无法解释的后续变化，保留证据和锁进入 review，不谎称业务已一致。

### 8.4 直接链上操作

| 观察结果 | 处理 |
| --- | --- |
| 已知 milestone hash，角色/状态/金额均合法 | 按 finalized 历史投影；chain 来源原因可为空 |
| 已知争议被直接更新提议 | 重放版本，刷新页面；旧 prepared 不可覆盖新提议 |
| 直接接受或仲裁与 Web 面值、剩余本金完全一致 | 验证并投影，终结竞争中的应用操作时保留各自结果 |
| 未知 milestone hash 或本地里程碑不满足业务条件 | 合约 review；保存 PDA/hash/签名；禁止新付款 |
| release 金额不同于里程碑面值 | 保存观察到的链上金额；DB 留在最后已验证账本；人工核查 |
| 未知账户布局、复合指令、历史缺口或余额冲突 | review；不自动修正为“已完成” |

review 页面区分“数据库最后已验证金额”和“链上观察金额”，显示核查原因与签名，不能继续提供业务操作。解除 review 需离线只读核查报告及明确的数据修复方案，本轮不增加一键忽略异常功能。

### 8.5 首次注资与初始化基线

chainSyncStatus 表示核对质量；chainBaselineKind 表示链上阶段，两者分开。uninitialized 表示尚未执行可靠检查，不等于账户不存在；完成检查后可以是 synced + absent。

| finalized 观察与历史证明 | 基线与准备行为 |
| --- | --- |
| 正确网络中 escrow 尚未创建，policy/争议/receipt 无异常，DB 为 draft 且 F/R/Q=0 | synced + absent；允许 fund，构建 initialize（按 policy 选择）+mark_funded 的原子组合；禁止 release/争议 |
| escrow 为 INITIALIZED，参与钱包、contractId、totalAmount、Mint、vault 和 policy 均匹配，F/R/Q=0，初始化历史完整 | synced + initialized；允许 fund，只构建 mark_funded，不重复 initialize；Web 合约仍 draft |
| escrow 已 FUNDED，历史与资金证据完整 | synced + funded；先投影实际注资结果，将相应交易核对，再返回已注资状态，不生成第二笔 fund |
| escrow 应存在却缺失，初始化配置不匹配，部分账户异常，或历史缺口 | review；保留原业务状态，禁止准备 |
| RPC 读取失败或无法取得一致 finalized 证据 | degraded；不得把失败当作账户缺失 |

absent 的证明记录 genesisHash、programId、派生 PDA、成功 finalized 空账户读取的 context slot，并用历史头重查验证没有初始化变化。金库在 escrow 创建前若已存在或出现未知相关历史，本轮作为异常进入 review，不将其当作正常首次创建。RPC 暂时 null 不作为过期终结依据；需结合完整历史与重复账户读取收敛。

initialized 必须从成功 initialize 历史重建并核对账户和金额，不仅看 status。现有 bilateral 初始化不创建 policy PDA，**policy 缺失在 bilateral 下合法**；arbitrator 初始化必须存在匹配的 policy。两种情况下金库均须正确绑定 escrow/Mint/Token Program；外部额外 Token 沿用第 8.3 节本金规则。若程序配置或参与钱包变化，进入 review，不沿用旧初始化账户。

fund operationContext 增加 fundingStage=initialize_and_fund/fund_existing_initialized，并保存已验证初始化证据引用（后者）。交易 envelope、历史重放与过期核查按该阶段分派：前者核查未出现初始化/注资；后者核查仍为相同 INITIALIZED 基线且没有注资。F=R=Q=0 的空初始基线不生成虚构 ChainAppliedInstruction。

初始化独立完成也纳入扫描：扫描范围不能仅依赖 DB fundedAmount>0，必须包含 pending 操作、已绑定 escrow 的 draft、initialized 基线和需要复查的记录。准备 fund 时无论是否已绑定 escrowAccount，都从 contractId 派生 PDA 检查，避免漏掉直接链上初始化。

## 9. 对账任务、并发与恢复

后台候选包括需要检查构建期限的 building、signed、submitted、confirmed，以及需要检查过期的 prepared。所有 kind 共用 dispatcher 与证据投影器；另设合约扫描任务，覆盖全部非终态已注资合约及有 pending/review 的终态合约，以发现没有 Web 交易记录的直接链上操作。

扫描批量和并发有上限，游标持久化；RPC 限流与短暂错误指数退避。现有 2 分钟执行租约可保留并按需续租；每个成功写入也必须验证 leaseId、过期时间及 Contract 游标。租约过期的旧 worker 不得推进账本或清锁。

### 9.1 所有业务写入的统一锁协议

共用服务辅助函数：事务开始先按 contractId 获取 Contract 行的 `SELECT ... FOR UPDATE`，再读取合约、里程碑和争议并验证权限与条件；锁顺序统一为 Contract → 关联业务行 → EscrowTransaction。事务外旧对象只能用于预检查，不可作为更新依据。

必须覆盖：submitMilestoneProof、approveMilestone、requestMilestoneRevision、acceptContractClaim、cancelContract、deleteContract，以及 fund/release/dispute 全部 mutation、账本投影和任何改变 worker/policy/Mint/金额/业务状态的入口。创建新的合约还没有待锁行；创建成功后的修改遵守同一协议。只修改标题/可见性或写评论无需资金 pending 门禁，但不得顺带改动状态或交易绑定字段。

- 用户发起的非链上业务状态写入：链上模式下锁内重新检查 contractLockKey、degraded/review 及最新业务状态。building/prepared/signed/submitted/confirmed 或遗留 review 锁均禁止业务状态变更，返回 409 或相应不可核对 code，避免 pending open 时仍批准或交付。交易准备按第 7.1 节检查无锁；签名登记按第 7.2 节检查本操作锁。内部构建恢复、确认和链上投影必须获准处理其对应 pending 操作，不能被用户操作的 pending 门禁拒绝；它们校验操作身份、锁所有权（如有）、租约和证据，review 时只保存核查材料，不未经核查推进业务。Mock 不使用链上同步门禁，但同样锁内复查与串行更新。
- 所有业务状态或交易绑定字段变更递增 businessRevision；链上游标推进和核查状态变更也递增该 revision。prepare 和投影提交使用读取时 revision + 扫描游标 CAS，防止无新链上指令时的本地状态变化漏检。
- 里程碑更新以锁内读取到的旧 status 作条件更新，成功行数必须为 1；ProofSubmission 版本在同一锁内分配。关联业务记录、事件和 revision 在同一事务提交，失败全部回滚。
- 投影器在持锁事务内使用已重新读取的状态，不用锁前 Contract 的 releasedAmount 累加。扫描器与确认器共用证据去重及投影函数；RPC 在事务外完成，成功提交同时检查租约、revision 和游标。重复证据不得重复递增金额、事件或 revision。

竞争结果必须明确：交付/批准/修改先完成则 prepare 或投影读到新状态；building 或争议投影先完成则旧请求锁内复查后被拒，不能把 disputed/released 覆盖为 submitted/approved/revision_requested。对于直接链上 open，若其落链期间存在本地修改，按最新锁内可争议状态保存 previousMilestoneStatus；无法映射到合法业务状态时 review，不覆盖本地记录。

### 9.2 故障恢复矩阵

| 故障点 | 恢复规则 |
| --- | --- |
| building 占锁后、消息保存前崩溃 | 期限后按 buildToken/status CAS 终结并解锁；旧构建器不能发布；无需 blockhash 证明 |
| 消息保存后、prepare 响应前崩溃 | 已是 prepared；幂等查询返回同一消息，不能按 building 解锁 |
| prepared 后拒签或关闭 | 无签名证据时检查有效期；证明过期且链上未变化后 failed 并释放锁 |
| 签名后 record-signed 前关闭 | 尚未广播；浏览器重传相同字节，或过期核查后重建 |
| record-signed 已保存但响应丢失 | 后台恢复发送；客户端查询/重传，不准备另一笔 |
| 广播超时或响应丢失 | 查询同一签名，必要时重发同一字节 |
| confirmed 但未 finalized | 展示等待；不更新业务 |
| finalized 成功，数据库暂时失败 | 重跑同一证据投影，最终只更新一次 |
| finalized 交易失败 | 保存链上错误；验证无业务效果后 failed、释放锁 |
| RPC 返回 null | 继续核查；null 不是未执行证明 |
| 提议被替换或结算被另一方抢先执行 | 同步先行操作；核对本笔失败/过期证据，刷新最新状态 |
| 超过自动重试预算 | requiresReviewAt + 合约 review，保留锁和签名 |

已进入 prepared 及之后阶段的过期终结必须同时具备 finalized 有效期证明、历史签名核查和完整合约同步结果；单纯经过五分钟或超过租约不够。使用保存的 lastValidBlockHeight，并结合 blockhash 有效性查询。[有效期字段](https://solana.com/docs/rpc/http/getlatestblockhash)、[blockhash 查询](https://solana.com/docs/rpc/http/isblockhashvalid)

## 10. 页面交互与隐私

- 合约页显示争议方式、当前提议人、结果、金额、版本和链上同步状态；创建前选择方式的交互沿用迭代 1。
- 发起原因必填且长度受限，hash 按统一 UTF-8 编码计算。明文只对本合约参与方及指定仲裁人展示，不放入公开事件列表。
- 提议面板支持“支付本里程碑”或“退还全部剩余本金”，显示准确金额；接受自己的提议不可用。
- 仲裁人显示裁决入口、付款/退款确认和本人未完成交易；工作区提供“我仲裁的”过滤或明确入口，避免只能靠直接链接找到。
- 退款确认说明退款金额、收款钱包和合约终止效果；release 明确收款工作者及金额。
- 同一合约有 pending 时禁用其他链上动作，显示阶段与签名；操作者可查询/恢复，其他参与方只看最小公共状态。
- 钱包变更或断开后重新检查会话与角色；不能用旧钱包恢复新钱包的交易。网络/程序不匹配时显示具体不可用原因。
- 仲裁人 serializer 继续隐藏申请者、无关 profiles/comments/events；新增独立 recovery DTO，仅给本人 txId、kind、status、txSig、时间、可操作错误 code。不能为恢复功能放开完整 escrowTransactions。
- degraded 显示“链上状态暂不可核对”，提供重查；review 显示核查原因和证据入口。Explorer 链接使用已验证网络配置。

## 11. 入口开关与兼容

新增服务端 `ONCHAIN_DISPUTES_ENABLED=false`。本轮只允许显式配置的 localnet，核对 genesisHash、程序 ID、可执行账户/ProgramData、批准的构建产物摘要、Mint 和 schema/worker 能力。程序验证用已构建产物对应的部署字节码摘要，不能只看程序 ID 或账户存在。

运行时能力返回 canOpenDispute/canPropose/canAccept/canArbitrate 及不可用 code。fund 的 init_with_arb 也必须通过相应程序能力检查，避免新 Web 对旧程序注资。UI 开关之外，所有 mutation 服务再次检查。

Devnet 保持关闭，升级和配置经迭代 3 验收后另行开放。Mock 保持既有流程，并增加版本/角色回归保证两种模式规则一致；不能用 Mock 测试替代链上验收。

## 12. 实施顺序与评审门槛

| 步骤 | 改动范围 | 完成门槛 |
| --- | --- | --- |
| 1 | 迁移、kind/context、building 与业务 revision、全部状态写入锁协议、签名持久化 API | 数据回填可重跑；构建超时 CAS、状态写入竞争与签名校验通过集成测试 |
| 2 | 解码、历史重放、全争议扫描、首次注资/既有初始化分支、fund/release 对账改造 | 首次 fund、单独初始化后的 fund、旧交易后有新交易、额外 Token、未知 hash 等用例通过 |
| 3 | 六种争议交易构建、角色校验、finalized 业务投影 | 双方及仲裁两条路径资金/状态精确，重试不重复 |
| 4 | 钱包辅助函数、合约 UI、本人恢复 DTO、能力开关 | 关闭页面与切换钱包可恢复，无隐私扩大 |
| 5 | 独立链上数据库运行器、浏览器回归、故障注入、文档 | 验收矩阵全过且有签名/金额/状态证据 |

文档与本轮实现一起提交，不单独创建文档提交。每步可内部验证，但只有全部退出条件通过才宣称迭代 2 完成。

## 13. 验收矩阵

使用独立 `vesti_onchain_integration_test` 数据库 schema、本地 Solana validator、经典测试 USDC Mint 和需求方/工作者/仲裁人三个测试钱包；与 Mock 测试库隔离。浏览器钱包适配器以测试 Keypair 签名，只用于 localnet，明确不代表 Phantom 等真实扩展验收。

| 类别 | 必须通过的用例与断言 |
| --- | --- |
| 双方协商 | open→propose→对方 accept release/refund；提议方接受被拒；双方均可提议 |
| 指定仲裁 | 仲裁 release/refund；没有提议可裁决；普通钱包裁决被拒；双方仍可协商 |
| 金额 | 前置普通付款后退款仅剩余本金；Web release 面值；退款后余额本金为 0；额外 Token 不阻断核对 |
| 权限隐私 | 匿名/申请者/外部钱包无操作权；仲裁人不读申请者；只读本人 recovery DTO；签名字节不泄漏 |
| 消息校验 | 修改 amount/accounts/instructions/payer/blockhash/签名均被拒；客户端 txSig 不可替换 |
| 幂等并发 | 重复 prepare/record-signed/confirm；两方接受与仲裁竞争；付款与 open 竞争；open/投影分别与批准、交付、修改双向竞争；draft 取消与 fund 竞争；状态不被覆盖，金额与事件只变一次 |
| 崩溃 | building 创建后、消息保存前、prepared 保存后响应前、签名、广播、finalized、DB 投影前后中断；building 自动解锁；prepared 保留安全核查；过期旧构建器 CAS 失败且不能发布 |
| 首次注资 | absent 首次 fund；bilateral 无 policy 合法；独立 initialized 后仅 mark_funded；已 funded 不重复；初始化不匹配或 RPC 失败阻止准备；两种 fundingStage 过期均正确恢复 |
| 网络 | RPC 超时/null/限流、blockhash 过期、confirmed 尚未 finalized、确认分叉；不提前改业务 |
| 历史 | 已成功交易后又有付款/替换提议；同 slot 多交易按区块顺序；多指令按指令位置；重跑不重复事件 |
| 应用外 | 已知正常直接操作可同步；未知 hash、金额偏差、复合指令、未知 CPI 和历史缺口隔离 |
| 租约 | 旧 worker 在租约过期后提交被拒；新 worker 唯一投影；人工核查锁不自动过期 |
| 迁移兼容 | 旧 prepared/submitted/confirmed、多个 pending、Mock 数据；旧 schema 升级且历史不丢失 |
| 功能开关 | 默认关闭；旧 Devnet 程序拒绝；localnet 匹配才开放；后端与 UI 一致 |

测试证据逐项记录：钱包、kind、txSig、finalized slot、程序/Mint、F/R/Q、金库与收款余额、Tx/Dispute/Contract 状态、事件数量。程序单测、服务集成、真实链上数据库测试和浏览器测试分别报告，不混称一个“全部通过”。

**退出条件**：两种 policy 的页面资金出口全部通过；签名前后和链上成功后中断可恢复；直接链上异常能冻结应用操作；所有账本与已验证本金一致；现有 Mock、注资和普通付款不回归；运行命令与证据写入交付记录。没有 Devnet 真实钱包证据时，结论仅为“本地验证器 Web 链上闭环完成”。

## 14. 风险与明确边界

- 双方无协议或仲裁钱包失联仍可能持续冻结，页面准确说明，不能通过 Web 状态绕过链上规则。
- finalized 和历史扫描增加等待与 RPC 成本；正确性优先，历史不完整时需要可提供完整历史的 RPC 或人工核查。
- 合约锁限制本应用操作，不能阻止用户直接调用程序；外部操作由扫描和隔离处理。
- review 可能暂时阻止 Web 出口；链上既有参与方和仲裁权限保持有效，后续任何直接操作仍必须核对。
- 迁移、交易辅助函数与统一业务锁影响现有 fund/release、交付和批准等流程，必须将它们纳入验收，不能只测新按钮。
- 本轮不提供自动人工账本修复、Devnet 升级或生产自动化。它们需要独立证据和明确实施范围。

## 15. 本次评审修订记录

| 评审项 | 已补齐的设计 | 实施验收证据 |
| --- | --- | --- |
| P1 非链上写入可能覆盖争议投影 | 第 3、5.2、9.1 节：全部状态写入按 Contract 行锁串行，锁内复查、businessRevision 与条件更新 | 并发批准/交付/修改与 pending open/投影，两种先后顺序均不破坏状态 |
| P1 构建前崩溃可能永久持锁 | 第 5.1、7.1、7.1.1、9.2 节：building 不发布消息，原子 prepared 提交，期限及 buildToken CAS 恢复 | 构建超时解锁、晚到构建器被拒；消息已保存则不按 building 解锁 |
| P2 首次注资缺少同步基线 | 第 5.2、8.5 节：absent/initialized/funded 三分支，policy 存在规则及对应资金构建/过期核查 | 新合约注资、独立初始化后注资、已注资幂等与账户不匹配隔离 |

上述记录保留设计评审背景。本轮对应实现及本地验收见[交付记录](iteration-2-delivery.zh-CN.md)。

## 16. 本轮实现映射

协议及历史核验位于 `lib/blockchain/chain-protocol.ts`、`chain-history.ts`；持久化操作与投影位于 `lib/services/transactions/chain-operations.ts`、`chain-sync.ts`；状态写入共用 `contract-lock.ts`。新增迁移为 `20260930090000_web_chain_disputes`。

API 沿用项目的平铺 transaction 路由约定，新增 prepare-dispute、record-signed、status、resume、confirm-dispute 和 chain-sync；fund/release 共用新协议。浏览器与真实链/数据库验收由 `pnpm test:chain-integration` 执行，并接入 CI 工作流；接入不代表远端 CI 已运行。

本轮采用完整历史重放，超过 20,000 签名或遇到版本化消息、未知 CPI/指令封装进入 review；未实现自动人工账本修复。能力默认关闭，仅批准的 localnet 可开启。Devnet 升级与真实钱包扩展验收留待下一迭代。
