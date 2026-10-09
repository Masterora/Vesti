# 迭代 3 Devnet 真实交易验收详细设计

本轮把迭代 2 的本地链上闭环交付为可重复验收的 Devnet 验证版。完成标准是指定发布版本、真实 Devnet 交易、真实钱包签名和数据库本金账本逐笔一致，而不只是部署成功。文档是设计，尚未实现、部署或产生 Devnet 验收结果。

设计日期为 2026-09-30，评审修订日期为 2026-10-08，代码基线为 `c0fc70bc8ecd3bb36b1dbfc14e22a4417b1bd210`。本轮延续经典 SPL Token、六位小数测试资产、Creator 绑定的 v2 地址、最多 8 项固定里程碑，以及双方协商或预先指定仲裁者的资金出口。

## 目标与范围

本轮交付四个完整切片：发布前配置与身份校验、可控的程序部署与旧数据处理、Devnet 资金验收、真实钱包操作和恢复验收。核心 Web 流程沿用现有接口及持久化交易状态机，避免另外建设一套只供演示的资金实现。

| 纳入本轮 | 明确留到后续 |
| --- | --- |
| 独立 Devnet 数据库、应用进程、RPC 与测试钱包 | Mainnet、生产资金试点、法币、KYC |
| 程序 ID、部署权限、构建字节和运行身份核对 | 更换托管经济规则或新增单方超时退款 |
| 开启经过验证的 Devnet 争议能力 | 全量浏览器、移动钱包和可访问性验收，仍属迭代 4 |
| 指定 Worker、公开申请、普通付款及四种争议资金出口 | 长期托管、备份恢复、告警平台，仍属迭代 5 |
| 单一明确支持的钱包扩展真实签名与恢复 | 一次声明 Phantom 和 Solflare 均兼容 |
| pending 排空、有限旧版本升级与可审计身份转换 | 自动迁移未知旧账本、20,000 签名以上的历史索引 |

默认测试资产是项目创建的 Devnet 六位小数经典 SPL Token，页面标为“测试 USDC”，并显示 Mint 地址；不能把同名 Token 描述为发行方真实 USDC。若选择发行方 Devnet Mint，先独立核验地址和资金来源，再绑定整轮验收，不能中途替换资产。

## 现状与实施缺口

| 实际代码位置 | 当前行为 | 本轮设计 |
| --- | --- | --- |
| `lib/blockchain/chain-protocol.ts` 的 `disputeCapability` | 只允许 localnet 与争议开关共同开启 | 引入完整发布配置校验，允许明确批准的 localnet/devnet，始终拒绝 mainnet/testnet/unknown |
| 同文件的 `chainIdentity` | 验证 genesis、程序 hash、经典六位 Mint | 保留实际 RPC 核验，增加发布标识、环境标签与批准 genesis 的一致性检查 |
| `chainConfig` 与浏览器 WalletProvider | 服务端和浏览器共享 `NEXT_PUBLIC_SOLANA_RPC_URL` | 区分服务端私有 RPC 与公开浏览器 RPC，禁止把服务端凭据打包进浏览器 |
| `app/api/runtime/public-config/route.ts` | 只有 mode、network、争议能力布尔值 | 增加可读运行状态和脱敏原因，区分新操作暂停与旧交易恢复 |
| `lib/services/transactions/chain-operations.ts` | 争议准备检查能力；资金操作没有统一运维停写开关 | 所有新准备经过统一入口；保存原签名和恢复不被新准备开关关闭 |
| `chain-sync.ts` 与 `assertChainContextIdentity` | 已存程序 hash 变化会拒绝同步和恢复 | 升级前排空旧 pending；无 pending 的旧合约必须经专用审计转换才能绑定新版本 |
| `components/wallet/wallet-provider.tsx` | 使用 `window.solana`，应用 RPC 在签名前后检查 genesis | 明确选择 provider、处理账户变化；不把应用 RPC 检查称为钱包设置网络证明 |
| `get-system-health.ts` | 数据库可达即可报告健康 | 保留轻量存活检查，增加独立的链上就绪检查，避免让链故障表现为进程死亡 |
| `scripts/inspect-chain-identity.ts` | 输出 program ID、genesis 和部署 hash | 新增发布预检、只读账户盘点、部署核验和验收证据工具 |
| `.github/workflows/ci.yml` | verify/onchain 包含本地链与浏览器测试 | CI 保留无秘密的本地 gate；Devnet 测试以显式手工运行和隔离凭据执行 |

现场执行 `cargo fmt --manifest-path programs/vesti-escrow/Cargo.toml --check` 返回失败，差异集中在新增 v2 和计划辅助代码的格式。下一轮先修正格式、重跑现有 Rust gate；本次设计不修改程序，也不将此前本地构建成功描述为远端 CI 已通过。

## 发布身份与环境隔离

定义不可变的 `ChainReleaseManifest`，作为部署、Web 配置和验收证据共同引用的发布记录。提议保存在 `docs/releases/<releaseId>/manifest.json`；含密钥的运行文件放在受控环境，不能入库。

```typescript
type ChainReleaseManifest = {
  schemaVersion: 1;
  releaseId: string;
  sourceCommit: string;
  cluster: "devnet";
  genesisHash: string;
  programId: string;
  programDataAddress: string;
  programLoader: string;
  upgradeAuthority: string | null;
  deployedSlot: string;
  deploymentTxSig: string;
  predecessorManifestSha256: string | null;
  protocolDescriptorSha256: string;
  activationEvidenceSha256: string;
  artifact: { sha256: string; byteLength: number; idlSha256: string };
  deployedProgram: { sha256: string; payloadLength: number };
  mint: { address: string; tokenProgram: string; decimals: 6; label: "test_usdc" };
  toolchain: { anchor: string; solana: string; rust: string; node: string };
  verificationEvidence: string[];
};
```

`sourceCommit` 必须是实际候选发布提交，不能沿用设计基线。`releaseId` 是日志、截图和验收关联键；其 JSON 文件另计算摘要用于审计。文件 hash 和链上 ProgramData payload hash 分开记录：当前 `readProgramHash` 包括代码后的部署空间填充，因此不能用 `.so` 的 sha256 直接填写 `ESCROW_PROGRAM_SHA256`。

部署核验需下载部署代码，按已确认的 loader 布局比较精确构建字节及填充，并核对 executable、owner、ProgramData、部署 slot、升级权限。不能仅查询链上 hash 后把它自动记为“批准”。另外尝试固定工具链的可验证构建，以独立工具核对源码与部署；若所用 Anchor 版本或构建环境不支持，则作为发布 gate 未通过，先解决工具链，不能静默跳过。Solana 区分 Program、ProgramData 与升级权限，Anchor 提供可验证构建流程。[部署参考](https://solana.com/docs/programs/deploying)、[构建参考](https://www.anchor-lang.com/docs/references/verifiable-builds)。

Devnet 应用使用独立数据库或独立 database/schema、独立 `AUTH_SECRET`、独立主机名和后台进程。仅换端口不算会话隔离：当前固定的 `vesti_session` Cookie 不按端口区分。推荐分别使用 `local.vesti.test` 与 `devnet.vesti.test`，Cookie 保持 host-only、不设父域 Domain；实际公开环境使用相应 HTTPS 主机名。若本地必须共用主机名，则增加部署环境专属 Cookie 名，读取、设置、清除及会话测试统一使用该名称；禁止依赖独立 AUTH_SECRET 防止 Cookie 覆盖。[Cookie 端口边界](https://datatracker.ietf.org/doc/html/rfc6265#section-8.5)。

禁止把 localnet/Mock 原有合同表直接指向 Devnet。Mint 初始化钱包、程序升级钱包和参与者钱包分离；程序升级密钥不放入 Web 容器、浏览器、验收 JSON 或 CI 通用 secret。

### 配置契约

下表新增项均为提议，当前代码尚不支持。

| 配置 | 作用与默认规则 |
| --- | --- |
| `ESCROW_RELEASE_ID` | Devnet 必填，与发布 manifest 对应；日志与就绪响应使用 |
| `ESCROW_NETWORK_GENESIS_HASH` | 保留现有语义；Devnet 值必须与独立确认的 Devnet 身份一致 |
| `ESCROW_PROGRAM_SHA256` | 经过部署字节核对后的链上 payload hash，禁止自动更新 |
| `ESCROW_PROGRAM_ID` | 与 Rust、Anchor.toml、manifest 同一地址 |
| `SOLANA_SERVER_RPC_URL` | 新增服务端 RPC；仅服务端读取，允许私有访问凭据 |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | 仅公开浏览器 RPC，构建时写入；不能承载私有服务端 key |
| `NEXT_PUBLIC_SOLANA_NETWORK` | 保留公开标签；与实际 genesis 不一致时拒绝就绪 |
| `NEXT_PUBLIC_USDC_MINT` | 整个环境固定的批准测试 Mint |
| `ESCROW_CHAIN_NEW_OPERATIONS_ENABLED` | 新增，onchain 未设置时默认 false；只作进程级允许上限，不能单独恢复数据库维护状态 |
| `ESCROW_CHAIN_DISPUTES_ENABLED` | 保留，额外控制新争议动作；关闭不阻断旧签名恢复 |

新准备的有效条件为进程开关允许、数据库发布阶段为 open、进程 manifest 与数据库 active release 匹配、实际链身份通过。缺少数据库发布状态时失败关闭，不自动建为 open。Mock 不依赖链上就绪；localnet 仍要求原有 pin，测试脚本显式初始化隔离发布状态与开关。禁止仅将环境标签改为 localnet 来绕过 Devnet gate。浏览器重新构建后核对公开配置与服务端 manifest，防止旧构建连接旧 Mint/RPC。

## 能力控制与接口设计

提议新增 `lib/blockchain/chain-readiness.ts`，统一提供：配置解析、发布一致性检查、实际链身份检查、Mint 核对和可执行能力。短时间内可共享在途 RPC 查询，超时后失败关闭；不能将缓存成功作为资金写入时的身份校验替代。

```typescript
type ChainRuntimeState = {
  escrowMode: "mock" | "onchain";
  network: string;
  releaseId: string | null;
  chainState: "ready" | "paused" | "unavailable" | "mismatch";
  canPrepareFunds: boolean;
  canOpenDispute: boolean;
  canSettleDispute: boolean;
  recoveryState: "available" | "paused" | "identity_mismatch" | "temporarily_unavailable";
  reasonCode: string | null;
  maintenancePhase: "open" | "draining" | "frozen" | "deploying" | "rebinding";
  maintenanceEpoch: string;
};
```

在现有 POST `/api/runtime/public-config` 响应上增量扩展，保留既有字段；不暴露 RPC URL、凭据、数据库错误栈或密钥路径。`recoveryState=available` 只说明当前发布在 open/draining 可执行恢复检查，不承诺任意旧交易身份匹配；每条交易仍核对自己的不可变 `operationContext`。frozen/deploying/rebinding 返回 paused，并保留查询入口，不让页面显示可广播的恢复按钮。

提议新增 POST `/api/runtime/chain-readiness`，只读、限流，正常 200，配置/身份/依赖故障 503。保留 `/api/health` 的数据库健康语义，部署平台分别配置存活和就绪。链 RPC 故障时无需无限重启正常进程。

统一错误码：`NEW_OPERATIONS_PAUSED`、`CHAIN_CONFIG_INVALID`、`CHAIN_NETWORK_MISMATCH`、`CHAIN_PROGRAM_MISMATCH`、`CHAIN_MINT_MISMATCH`、`CHAIN_RPC_UNAVAILABLE`。既有金额/提案冲突仍返回业务冲突；新准备暂停或链不可达返回 503，页面显示恢复动作而不是重新签名。

### 操作与开关的关系

| 操作 | 维护时行为 |
| --- | --- |
| 新建链上合同、接受 Worker 并创建新链身份绑定 | 仅 open 且有效 gate 通过时允许 |
| fund、release 与争议动作的 prepare | 仅 open；创建 building 与发布 prepared 两个事务都复查 epoch |
| record-signed | open/draining 允许原 prepared 精确签名；其余阶段拒绝新保存，不删除旧记录 |
| resume、confirm、后台 recover | open/draining 允许按原身份恢复；frozen/deploying/rebinding 仅查询，不广播或投影 |
| chain-sync、查询、健康、证据导出 | 查询始终保留；普通同步投影仅 open/draining，rebinding 仅受控转换器可投影，身份不符时保留原账本 |
| 交付、批准、修改、可见性变更 | 维护窗口冻结参与盘点合同的业务写入，防止快照版本变化 |

维护状态不是链上暂停机制：用户仍可能通过旧页面或直接指令操作。部署盘点必须二次核对历史、账户和 businessRevision，不能仅因关闭 UI 就断言状态静止。draining 阶段恢复 Worker 保持启动；进入 frozen 前必须完成下面的原子排空判定，不能仅等待固定时长或关闭页面。

### 跨进程维护状态与排空协议

新增 `ChainReleaseControl` 表，按批准的环境键唯一绑定 genesis、program ID 和 Mint，保存 `phase`、单调递增 `epoch`、active/target manifest 摘要、维护批次、操作者及更新时间。合法阶段为 open → draining → frozen → deploying → rebinding → open；失败停留在当前关闭阶段。只有受控运维命令可通过预期 phase/epoch 的 CAS 迁移状态，普通 Web 请求不能开启发布。

所有准备、业务写入、签名保存、Worker 领取和投影事务，按“发布控制行共享锁 → 合约行锁 → 操作行”的顺序加锁；维护切换持有发布控制行排他锁。共享锁在写入事务结束前保持，避免 gate 检查后切换阶段仍能提交。数据库状态不可达时不允许资金写入；每次写入读取真实状态，不使用就绪缓存授权。

创建 building 时记录独立字段 `releaseControlEpoch`，发布 prepared 时要求仍为 open 且 epoch 相同，另保留 businessRevision、buildToken 和期限检查。切到 draining 后，旧 epoch 构建器不能发布 prepared；运维按 buildToken CAS 取消仅在 building、尚未对外提供消息的记录，并解除其锁。既有 prepared 不受该取消规则影响，只能按原链过期证明处理。重复 prepare 在维护阶段可返回既有操作状态，但不重新返回可签消息；恢复使用 resume 接口。

Worker 领取租约和最终投影都检查 phase/epoch；切换后旧租约不能提交晚到结果。已在 draining 正常提交的原签名可继续恢复，不能因操作最初的 epoch 旧于 draining 就抹除或判失败。进入 frozen 的排他锁事务检查全部目标环境合同无 building/prepared/signed/submitted/confirmed、无资金锁、无活跃租约和未解决 review，再保存排空摘要。条件不满足就保持 draining；禁止批量清锁或直接设置终态。

部署 gate 还必须确认所有 Web/Worker 进程已运行支持上述协议的版本，或已停止并撤销旧进程写权限。旧版本进程不会读取控制表，不能通过表中新状态让它安全停写。多实例 rolling update 完成前不批准排空；新 active release 与旧进程 manifest 不符时旧进程写入继续被拒绝。

排空摘要记录 epoch、DB 快照版本和全程序账户盘点摘要。切换 frozen/deploying 前后重新盘点链上变化；DB 排空不能约束直接链上操作，也不能提供链与 SQL 原子性。每次恢复 open 都要复核当前 release 和受影响合同已完成账本同步，进入新的 epoch。维护中就绪响应报告 paused，但恢复服务不因该状态被存活探针杀死。

## 程序部署与升级决策

本轮不假设 Devnet 目标程序已经部署、升级权限可用、数据库没有旧资金或部署文件里的 keypair 与程序 ID 一致。实施时先只读盘点，明确选择一条路线。

| 盘点结果 | 允许路线 |
| --- | --- |
| 目标程序不存在，程序地址 keypair 与源码 ID 一致 | 首次部署该 ID，生成发布 manifest |
| 已部署且升级权限可控，DB 已排空，全程序账户兼容性盘点完整通过 | 同 ID 升级，执行下面的历史版本及绑定转换 gate |
| pending 可正常排空 | 在旧身份与旧程序仍有效时完成排空，再评估升级 |
| 权限不可用、旧账本不明、历史缺失或 pending 无法判定 | 停止同 ID 升级；可另提新 ID 和独立环境方案，旧资金环境保持恢复路径 |

新 ID 路线需要同步 Rust `declare_id!`、Anchor.toml、运行配置及测试预期；不能用环境变量覆盖一个不同的硬编码程序 ID。不能关闭有未结算资金的旧程序，不能删除旧数据库来伪造零 pending。首次盘点完成前，设计默认“同 ID 受控升级”，但不授权实际部署。

### 全程序账户兼容性盘点

同 ID 升级影响该程序的全部账户，因此盘点同时采用数据库合同和实际 program-owned accounts 两条来源，不能按批准 Mint、合同 ID 或“有数据库绑定”过滤后声称完整。使用支持完整查询的 RPC 获取 finalized 程序账户及上下文 slot，保存地址集合摘要；查询失败、截断、服务商结果限制或无法证明完整时，标记 incomplete 并阻断同 ID 升级。部署前后重查集合与变化账户，不把多次查询假设为同一原子快照。

按照经批准的旧版本账户 discriminator/布局解析 escrow、vault 关联、Mint、策略、争议、Receipt 和 plan。对每个 escrow 读取实际 Mint/vault owner、Token Program、金额与状态，分类为 legacy/v2、经典 Token/Token-2022/未知 Token、批准 Mint/其他 Mint、数据库已绑定/未绑定，以及资金出口是否兼容。未知布局不静默忽略；已关闭或无剩余本金也记录其仍可调用的行为和解码兼容性。

数据库未登记的 escrow 同样需要独立链上快照和旧→新真实资金出口验证，不能伪造合同导入来套用 Web 账本。批准 Mint 范围以外的账户影响程序升级兼容性，但不因此开放该 Mint 的 Web 新交易。盘点不声称能够列出用户手里所有未广播的直接签名；候选版本必须保留存量账户必要的有效资金出口，并把退役初始化的行为变化列入发布约定。

当前程序仅使用经典 `Token`、`Mint` 和 `TokenAccount`。如发现已有 Token-2022 或未知布局的未结算资金，而候选版本没有经过真实转账验证的兼容出口，禁止同 ID 升级。可先用旧程序结清并重新盘点，或另行实现兼容退出，或批准新 ID 的独立环境并保留旧程序/恢复服务；“本轮只支持经典 Token”不能作为冻结旧资金的理由。

### 发布步骤及失败处理

1. 候选提交完成格式修正、本地资金回归和候选 SHA 的远端 verify/onchain gate，保留 CI URL 与产物摘要。Devnet 步骤不因本地测试通过自动执行。
2. 导出程序权限、现有程序字节、目标 genesis/Mint、数据库版本、全程序账户兼容性和 pending 清单。盘点绑定明确 releaseId、源码版本和 RPC，完整性不足即停止。
3. 确认所有进程支持维护协议，CAS 切到 draining 并增加 epoch，冻结新准备和目标合同业务写入，保留旧身份恢复。prepared 不能因“未签名”就直接删除：用户可能已在外部持有签名但未 record-signed。
4. 使用原版本恢复 signed/submitted/confirmed；prepared 只有原链 finalized 高度越过 lastValidBlockHeight，且完整历史证明无对应资金变化后才能失败并释放锁。building 按既有期限和 buildToken 规则处理。
5. 原子确认相关交易终态、锁及租约排空，切到 frozen，保存旧基线、历史 head 和全程序盘点摘要。review 项逐条解决或阻断升级，禁止批量设成 synced。链上集合或资金状态变化需重证，不能沿用过时批准摘要。
6. 明确批准的部署者使用锁定产物部署。保存部署签名、slot、升级权限、ProgramData 和旧/新产物。SOL 费用与部署资金预算在实际执行前按程序大小和网络状态计算，不在设计中虚构固定费用。
7. 完成链上代码、激活边界与产物核验，写入人工批准的新 pin，切到 rebinding。先启用只读就绪检查，再执行无 pending 旧合约的账本投影与绑定转换；恢复 Worker 暂不领取或广播。
8. 全部目标合同转换及全程序兼容性复核通过，CAS 发布新 active release 并恢复 open。用新 Web 构建执行少量测试资产 smoke case，再开启正式 Devnet 验收。开始四种资金出口前检查测试者余额和 RPC 历史能力。

若部署失败或结果未知，先读取链上程序确定真实版本，不能继续使用旧 pin 猜测成功。若新程序已执行 v2 初始化或结算，不允许直接降级为不认识 plan 的旧程序；保持新准备关闭，用已部署、能处理当前账户的兼容恢复器或后续修复版本处置。

### 旧合约身份转换

旧 `operationContext` 不可改写。即使 pending 已排空，`Contract.chainBaselineEvidence.programHash` 也会拦截新代码；环境 pin 更新不足以解决此问题。

提议增加 `scripts/transition-chain-release.ts`，默认只读，输出精确候选清单和审批摘要；显式 apply 必须给出同一摘要、旧/新 manifest 和选定合约 ID。只支持 genesis、program ID、Mint 不变、代码版本变化且已验证兼容的转换。RPC 换链、Mint 换资产、其他程序 ID 不属于转换，不能复用该工具。

转换证明同时包含：旧版本部署前 finalized 本金快照、新版本部署后完整历史重放及当前账户、所有新历史的真实旧/新 ABI 解释、F/R/Q、金库额外 Token、争议状态、Receipt、计划和角色地址。维护窗口内的合法直接操作是新增证据，不要求其结果等于部署前本金快照；应验证连续状态转移并重新生成候选摘要。未知动作、证据冲突或无法解释的余额变化退出，不写库。

工具使用受限的部署兼容验证函数，不给普通 API 增加 ignoreHash 参数。历史重放不能仅把旧上下文 hash 换成新 hash；必须由旧/新程序的可信指令语义和升级边界支持。原始 `ChainAppliedInstruction.parameters`、证据 hash 和历史交易上下文保留，不能因为新发布 identity 改变而重算已投影指令的证据摘要。

每个合同转换在一个事务内完成：发布控制行共享锁 → `lockContract`，确认 rebinding、预期 epoch、businessRevision、原 baseline 摘要、无 pending/lease 和批准的当前 pin；按 finalized slot/交易位置/指令位置处理已证明的完整历史。已有 `ChainAppliedInstruction` 核对 message evidenceHash 后保留；未应用的已知资金证据复用正常同步的 `applyEvidence` 及唯一键，投影金额、里程碑、争议、Receipt 关联和业务事件，随后验证 DB 的 F/R/Q 与重放结果相等。全部通过后才更新新 baseline、同步位置和 businessRevision，并写审计记录。任一步骤失败回滚所有投影、事件和绑定，禁止只改 hash/同步位置后另行补账。

新增唯一约束为 `(contractId, fromReleaseId, toReleaseId)` 的 `ChainReleaseTransition` 表，保存维护 epoch、旧/新 manifest 与协议描述摘要、批准候选摘要、前后证据摘要、执行者公钥、时间和结果。重复相同批准摘要返回已应用结果；不同摘要拒绝，不能借“重试”补签额外证据。网络取证在 SQL 事务外完成，写入前复查 finalized head、账户摘要及部署身份；变化时重新取证和批准。链与 SQL 无法原子提交，事务后再次检测变化，新增证据交由专用转换增量批次投影并审计，环境继续 rebinding，直到复核通过才能 open。

事务后的新增证据使用 `ChainReleaseTransitionBatch` 子记录，唯一键为 `(transitionId, batchId)`，独立保存批准的增量摘要、起止 head、预期新 baseline 摘要及投影结果。父转换记录保持不可变；增量批次验证现有新身份，以相同投影唯一键执行，只推进未应用证据及新 baseline。旧批准摘要不能授权新证据，同一批次不同摘要拒绝。

多合同转换可分批逐合同原子提交，但整个环境在全部目标合同转换完成、审计清单完整及所有存量账户兼容 gate 通过前不开放。已转换合同在后续批次失败时保持新 baseline 和可审计结果，不撤销真实资金投影，也不回写旧程序 hash；修复后从未完成项继续。全环境转换协调器防止两批运维任务并发覆盖，取消任务不会将 phase 自动改为 open。

未初始化且无历史/交易的空合同也必须明确归类；不能用“账户不存在”重解释有旧资金记录的合同。fresh Devnet 环境不需要转换写库，但仍跑空盘点 gate。旧未知里程碑或部分金额冲突继续阻断，不在本轮实现自动账本改写。

### 历史版本注册与选择

新增显式的历史发布注册表，按 genesis、program ID 和可信发布链索引。每个 `ProtocolVersionDescriptor` 绑定源码/产物 hash、账户布局、指令 discriminator 与参数布局、账户次序/可选哨兵、地址方案、金额与权限规则、解码器版本及摘要；历史包不可覆盖，未知版本不能自动按最新布局解释。`ChainReleaseManifest` 通过 predecessor 摘要连接旧发布，不能仅记录最新部署 slot。

发布边界证据至少包含实际部署/升级交易签名、finalized slot 和交易位置、loader 指令与 ProgramData 指向、前后代码 hash、受控构建产物及经核验的激活规则。版本生效边界由固定工具链/loader 的规则和真实升级演练证明生成，不把部署 slot 直接等同于任意托管交易的执行版本。无法确认的边界范围标为 ambiguous；缺失历史发布产物或权限变更链则标为 unknown，并阻断转换。

重放按以下顺序执行：验证注册表链及当前部署 → 按 `(slot, transactionIndex, instructionIndex)` 找到已证明的发布区间 → 用对应 descriptor 校验 envelope、角色、账户、参数和 CPI → 输出统一的本金状态转移。addressScheme 只决定 PDA 派生，不能充当程序版本选择器；普通 API 同样必须使用注册表解释完整历史，否则转换后下次同步仍可能失败。

若 loader 激活边界不能将某笔交易唯一归入版本，则仅在已批准的候选版本集合均支持该消息，且账户/CPI 验证和完整状态转移结果完全一致时接受，并记录候选集合与等价证明；不得声称知道唯一执行代码版本。任何解码或语义分歧都拒绝，保持关闭阶段直到证据补齐。升级交易中的托管调用或其他不支持的复合 envelope 不自动放行。

历史 message evidenceHash 仍为真实序列化消息摘要，原始 `ChainAppliedInstruction.parameters` 与操作上下文不改写；发布归属、descriptor 摘要及边界证明另存于转换审计与派生验证证据。descriptor 选择不依赖审批人任意传入 ignoreHash，只允许通过批准的兼容发布链核验旧证据。

## 真实钱包流程

最低支持基线提议为桌面 Chromium + Phantom 扩展；钱包、浏览器与扩展版本在执行时记录，不在设计中声称兼容已通过。Solflare 作为第二组合在迭代 4 验收。

实现明确 provider 选择，优先使用明确标识的 Phantom provider；多钱包同时注入时不默默挑选最后的 `window.solana`。钱包登录签名、交易签名与会话地址必须相同；监听 provider 的账户切换和断开事件，立即清除过期角色操作，重新认证后再继续。

交易确认前显示 Devnet、测试 Mint、精确金额、收款地址、争议结果和提案版本。应用验证自身 RPC 的 genesis；由于当前 injected API 不提供可靠钱包网络证明，界面提示用户检查扩展网络，验收记录实际设置，不新增虚假的“已验证钱包网络”标签。

保持“精确消息签名 → record-signed 持久化 → 广播”的顺序。钱包若修改 blockhash、指令或账户，服务端拒绝保存并保留原操作锁；禁止为了兼容钱包而放宽消息相等检查。若目标扩展默认无法签署该协议消息，钱包验收未通过，先解决适配。

当前 `formatWalletActionError` 会把超时和 blockhash 错误统一显示为“过期，请重新签名”。本轮改为依据服务端状态显示：未签名拒绝、已保存待确认、已过期可重新准备、需要检查。RPC 超时、send 返回失败、刷新或弹窗关闭不能直接指示重新签名；由原链 finalized 证明才能允许新 attempt。

## 测试资金与金额断言

推荐每个场景使用新合同和独立 caseId，单合同总额 1 测试 USDC，两个里程碑为 0.4 与 0.6；按参与者数量预先铸造少量测试资产，整个验收有显式总量预算。额度是测试执行计划，不改变链上协议限额。

六位小数最小单位用整数 BigInt 或十进制字符串计算，禁止浮点运算。定义 F 为累计本金注资、R 为支付给 Worker 的本金、Q 为退款给 Creator 的本金、O=F-R-Q，X 为金库额外 Token。断言 vault=O+X；金额均在相同 finalized 证据窗口核验。

SOL 余额另记网络费与 rent，不能将 SOL 费用混入测试 Token 本金。参与者共享钱包时，场景串行且前后差值基于独立账本窗口；无法排除钱包其他交易时，不以全钱包余额差替代该合同 CPI 与金库证据。

测试资产 Mint/freeze authority 与程序升级权限分别记录；需要冻结 Token 的失败用例放在隔离 fixture，必须恢复解冻或明确记录其遗留状态，不能污染正常资金出口。

## Devnet 验收矩阵

| 编号 | 操作与故障 | 核心断言 |
| --- | --- | --- |
| D01 | 指定 Worker，注资 1，交付/修改/重新交付/批准/付款 0.4+0.6 | O=0，Worker 实收 1，Receipt 唯一，Web/DB/链同终态 |
| D02 | 公开申请、选定申请者、注资与付款 | 未选定者不能签资金动作；最终 Worker 与链上角色一致 |
| D03 | 双边争议接受付款 0.4，正常结算剩余 0.6 | 版本与金额匹配，最终 R=1、Q=0 |
| D04 | 正常付 0.4，争议双方接受剩余退款 | R=0.4、Q=0.6、O=0、cancelled |
| D05 | 指定独立仲裁者裁决付款，结算其余里程碑 | 只有指定者可裁决，本金和 Receipt 一致 |
| D06 | 指定仲裁者裁决退款 | 已付本金保留，剩余本金全部返 Creator |
| D07 | 旧提案被替换，再接受旧版本/错误结果 | 请求拒绝，没有额外 Token 变化和投影 |
| D08 | record-signed 保存后阻止浏览器广播、重启应用 | 后台重播同一字节/签名，只投影一次 |
| D09 | 保留旧签名交易并重复确认、双击接受 | 只有一笔资金结算、一条同一指令投影 |
| D10 | 未广播消息等待原链 finalized 高度越界 | 证明未落链后释放锁，新 attempt 和消息分离 |
| D11 | 同时准备付款与退款、过期租约继续投影 | 合约互斥；晚到/失效租约不能更新账本 |
| D12 | legacy/v0 捐赠、预充值 PDA、额外测试 Token | 不误报本金，退款不包括 X，保留实际不受支持调用隔离 |
| D13 | RPC 中断、历史 null/缺块、数据库投影失败 | 不提前结算、不自动解锁，恢复后只入账一次 |
| D14 | 达到重试上限，非原钱包重试，再由原钱包重试 | 前者拒绝，后者证明身份后恢复调度 |
| D15 | 错误 genesis、代码 hash、Mint、浏览器 RPC 或会话钱包 | 不签新操作或不广播，旧上下文不被改写 |
| D16 | 最多 8 项计划、未知项、部分金额、PDA 抢占 | 8 项可注资，错误输入拒绝且资金不变 |
| D17 | 暂停新操作时保存旧签名并恢复 | 无新 prepare；旧已准备操作按原规则恢复 |
| D18 | 同 ID 升级或首次部署路线完整演练 | manifest 可核验；旧基线转换通过或证明无待转换项 |
| D19 | 两实例中一个延迟构建，另一个切换 draining；旧 epoch Worker 晚到 | 旧构建不能发布 prepared，晚到投影拒绝；保留既有 prepared 的真实恢复路径 |
| D20 | 维护窗口直接付款，转换中注入 DB 失败，再精确重试 | 首次投影/事件/baseline 全回滚；重试全部原子应用一次，F/R/Q 相等 |
| D21 | 多合同中部分转换失败，已转换合同又有直接操作 | 环境不 open；已成功项不倒退，增量批次独立批准且不重复入账 |
| D22 | 未绑定、其他 Mint、Token-2022、未知布局账户及截断盘点 | 全部进入兼容报告；未验证出口或 incomplete 时拒绝同 ID 升级 |
| D23 | 升级前后及边界交易、不同语义的候选版本、缺失历史版本 | 精确版本或已证明等价集合可重放；歧义/未知阻断；转换后普通同步仍通过 |
| D24 | localnet/Devnet 同时登录、分别登出和切换钱包 | 独立主机名或环境 Cookie 名不互相覆盖，原环境会话保持有效 |

D01–D06、D08、D10、D14、D17 必须用真实 Devnet 交易；D01、D03–D06 与 D08 另用目标钱包扩展从页面执行。拒绝类用例可以经真实消息构造/链上模拟验证，但必须说明是否广播、是否链上失败，不能把 Mock 返回值当作 Devnet 拒绝。

D13 使用应用/RPC 代理或暂停隔离 Worker/数据库连接制造故障；不破坏公共网络或共用数据库。D15 的篡改只在隔离进程/fixture，结束后还原批准配置。大规模噪声耗尽扫描上限仍是后续历史索引风险；本轮不能声明整体抗 DoS 已完成。

D19–D23 首先在专用 localnet 升级环境用真实程序、Token 和数据库执行确定性故障测试。D22 的不兼容 fixture 不放入拟升级的 Devnet 程序；Devnet 只读全程序盘点仍必须完整通过。D23 本地需真实部署两个版本并记录边界证据，不能仅预加载旧账户代替程序升级。Devnet 的实际发布边界另采集验证。D24 用两个独立应用地址及浏览器上下文内的同一 Cookie 存储验证，不以每个环境分开浏览器会话回避覆盖问题。

四种争议出口与普通付款必须至少两个独立 run 全部通过，每次使用新合同并重新核对发布身份。故障场景至少一次。后续任何涉及指令、历史解释、签名或金额逻辑的修复都使相关旧证据失效，按最终候选提交重新跑对应场景。

## 验收工具与证据格式

提议增加以下脚本，均显式接收 manifest 和 Devnet RPC。默认校验 genesis 后拒绝其他网络；禁止通过复用 localnet 脚本的 DROP schema 逻辑连接现有 Devnet 数据库。

| 脚本 | 默认行为与输出 |
| --- | --- |
| `inspect-chain-release.ts` | 只读预检程序/Mint/RPC/权限/历史能力，输出具体不满足项 |
| `control-chain-release.ts` | 默认查询 phase/epoch；经授权 CAS 切换阶段，frozen/open 带完整前置 gate |
| `inventory-chain-release.ts` | 只读 DB 与全程序账户盘点，包含未绑定、其他 Mint/Token Program、未知布局及完整性状态 |
| `verify-chain-release.ts` | 核对锁定产物、链上字节及 manifest，一致才生成验证记录 |
| `transition-chain-release.ts` | 默认 dry-run；apply 需匹配 epoch、批准摘要及所选合同，原子投影/校验/绑定，支持单独审批的增量批次 |
| `run-devnet-acceptance.ts` | 首先预检；新建 case，不清库、不部署，签名工具只取受控测试钱包 |
| `verify-devnet-evidence.ts` | 只读逐笔核对 finalized 交易、DB 投影、本金和证据完整性 |

脚本出口码提议统一为 0=通过、1=断言失败、2=环境阻塞、3=证据未完成；blocked/skipped 不算通过。CLI 只输出错误分类和脱敏上下文，不输出带查询密钥的 RPC URL。

每次 run 记录 `runId`、releaseId/manifest 摘要、源码 SHA、开始/结束时间、工具/浏览器/钱包版本、case 状态、实际执行方式。每个资金步骤记录合同/里程碑 ID、交易签名、finalized slot/交易位置/指令位置、escrow/vault/Mint/收款地址、Token 前后余额、F/R/Q/O/X、DB 操作和事件 ID、证据摘要，以及预期/实际/断言结果。

保留 Explorer `?cluster=devnet` 链接供复查；Explorer 可见不是完整资金校验证明。记录 raw RPC 证据和查询时间，避免历史裁剪后只有截图无法复核。不得提交私钥、seed phrase、会话 cookie、AUTH_SECRET、RPC key 或原始可重播签名字节；原始签名字节仍仅由服务端受控存储和恢复器使用。

自动化证据默认生成在忽略的 `output/iteration-3/<runId>/`，公开脱敏摘要经检查后放入 `docs/evidence/iteration-3/`。真实钱包截图由人工确认签署的步骤生成，自动化不得越过钱包确认 UI。

Devnet 运行不放在每次 PR 的通用 CI：公共 faucet、RPC 历史和测试钱包不可用时不能伪造 pass。建议独立手工工作流，固定 commit/artifact，只有公开 pin 及专用测试钱包权限，绝不拥有程序升级密钥；失败结果上传脱敏日志。部署仍是单独授权的发布步骤。

## 实施拆分与文件落点

| 切片 | 具体实现 | 必须先通过的验证 |
| --- | --- | --- |
| 3A 发布前基线 | Rust 格式修正、candidate CI、manifest schema、私有/公开 RPC 分离、预检工具 | 既有 check/integration/onchain/chain-integration 全绿；身份/配置矩阵拒绝测试 |
| 3B 维护与升级 | 发布控制行/epoch、全程序盘点、历史版本注册、原子转换与批次审计、部署核验 | localnet 真实旧→新部署演练；D19–D23、多实例及晚到构建/租约、转换后的普通同步回归 |
| 3C Devnet 资金 | 明确授权目标后部署、独立测试环境、资金工具、D01–D18 及真实边界/盘点证据 | 指定 release 的逐笔 finalized 账本证明及第二独立 run；不跳过兼容 gate |
| 3D 真实钱包恢复 | provider 选择/事件、会话主机名或 Cookie 名隔离、错误状态、真实扩展流程 | 扩展签署原消息，四出口及签名持久化/重启用例、D24 通过 |

3A/3B 的可运行产物和部署预览完成后，再提交目标程序、升级权限、候选 SHA、manifest、旧资金盘点和预算供批准。设计文件本身不触发部署或铸币。

主要改动落点为 `chain-protocol.ts`、新增 `chain-readiness.ts`、发布控制及历史版本注册模块、`chain-history.ts`、`chain-operations.ts`、`chain-sync.ts`、runtime API、WalletProvider、`lib/auth/wallet-session.ts`、详情页错误状态、`lib/i18n/error-messages.ts`、`prisma/schema.prisma` 及追加迁移、发布/验收脚本、CI、`.env.example` 和运维文档。保留原业务 API 的鉴权与合约锁，不建立绕过 service 层的验收接口。

测试文件建议为 `chain-readiness.test.ts`、`release-manifest.test.ts`、`protocol-version-registry.test.ts`、`release-transition.integration.test.ts`、`maintenance-gate.integration.test.ts`、会话隔离测试与 `tests/devnet/*`。追加迁移创建 `ChainReleaseControl`、`ChainReleaseTransition`、`ChainReleaseTransitionBatch`，并给构建记录增加可空的 `releaseControlEpoch`。迁移不会自动把旧 building 视为有合法 epoch；先 draining 并按原恢复/取消规则处理。现有 prepared 消息与 operationContext 不重写。新配置/runtime 响应不改造资金状态 enum；时间、BigInt epoch/slot/金额和摘要均有明确类型。

## 退出条件与未决输入

迭代完成需同时满足：候选 SHA 本地与远端 gate 通过；部署字节、源码、权限、manifest 和运行配置一致；全程序账户兼容盘点完整、维护状态与 epoch 可核验；历史版本与激活边界可证明；旧资金及 pending 路线有明确结果；转换新增证据已投影且普通同步能继续；两个独立 Devnet run 的正常资金场景通过；真实扩展执行四出口及恢复、会话隔离通过；所有阻塞项有处理结果；D01–D24 无未说明的跳过场景。

交付记录分别报告“实现完成”“本地验收”“Devnet 资金验收”“真实扩展验收”“外部环境部署”。只能在全部对应 gate 通过后称为 Devnet 验证版，不能称为正式版或路线图完成。

实施前只读调查仍需确定：目标 Devnet 程序是否存在及谁持有升级权限、是否存在旧账户/pending、批准的 Mint 与测试资产来源、可提供完整历史的 RPC、独立数据库和公开浏览器 RPC、真实扩展测试操作者。这些是执行输入，不阻止先实现本地预检与升级演练；调查不明确时阻断相应外部写入。

## 参考与关联文档

- [迭代 2 交付记录](iteration-2-delivery.zh-CN.md)：当前代码与本地验收边界。
- [正式版交付计划](final-delivery-plan.zh-CN.md)：迭代 3–6 的完成定义。
- [运维说明](operations.zh-CN.md)：当前 hash、恢复、旧账户及头像缓存边界。
- [Solana 程序部署](https://solana.com/docs/programs/deploying)：部署、ProgramData 与升级权限。
- [Anchor 可验证构建](https://www.anchor-lang.com/docs/references/verifiable-builds)：固定构建环境及部署核验。
- [Solana 交易确认与过期](https://solana.com/developers/cookbook/transactions/confirmation)：blockhash/preflight 一致性与区块高度。本项目继续要求 finalized 资金证明，不能用 RPC 超时替代过期证明。


### 2026-10-09 代码评审修订

部署前批准严格 candidate（固定源码/产物/IDL、程序/ProgramData/loader/权限、资产、前驱与 descriptor），不包含未知部署 slot、交易签名、激活证明和 padded payload。frozen→deploying 绑定 candidate SHA 并重新核验精确库存/出口批准。部署后形成完整 manifest 与真实 receipt，deploying→rebinding 核验锁定产物、IDL、finalized loader/ProgramData 与原 candidate 一致，再 CAS 绑定最终 target SHA。升级演练必须调用维护服务，不直接写 phase/target/open。

所有公开 runtime 别名在共享探测边界使用 5 秒缓存和全局 30/min 数据库预算；不将观察缓存用于资金授权。CI 获取完整历史，并用完整 predecessor SHA 重建旧程序。
