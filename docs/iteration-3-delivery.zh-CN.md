# 迭代 3 实施与验收记录

2026-10-08，基于 `c0fc70bc8ecd3bb36b1dbfc14e22a4417b1bd210` 的工作区实现。当前没有新的发布提交、远端 CI、Devnet 部署或真实 Phantom 扩展验收记录；不能将本轮称为完成 Devnet 验证版。

## 已实现

- 严格发布 manifest、批准的 genesis/程序/Mint 一致性检查、服务器私有 RPC 与浏览器公开 RPC 分离；新操作开关默认关闭。Devnet 必须提供经过摘要批准的历史注册表。
- `ChainReleaseControl` 与追加迁移：发布阶段、单调 epoch、active/target manifest 和维护批次。事务先锁发布控制行，再锁合约；阶段切换独占发布行。准备与 prepared 发布校验同一 epoch；Worker 租约记录独立 epoch，旧租约不得投影。
- draining 只取消未发布消息的 building，不取消 prepared。record-signed 和原字节恢复在 open/draining 保留，其他阶段暂停资金投影及广播。Mock 不依赖链上发布记录。
- 全程序账户盘点不按 Mint 或数据库过滤，包含未绑定/其他 Mint/Token Program、未知布局及关联验证。查询成功仍为 `countStatus=unattested`，需要单独批准完整查询证明和逐账户出口证据。
- 原子转换与不可变父/子审计。新证据使用正常 `applyEvidence`、唯一指令键与 F/R/Q 核对，同一事务写本金、业务事件、绑定及审计。旧参数和 operationContext 不重写。增量批次不能沿用旧批准摘要。
- 历史注册表仅支持已知的 legacy 无 plan 与 v2 plan 解码器、经典 SPL 固定本金语义。注册表摘要、前驱链、源码/产物/descriptor/激活证明相互绑定；未知版本和存在 envelope 分歧的边界拒绝。新 decoder/语义需要代码和链上验证，不能仅修改 registry 文件。
- 部署核验工具比较构建字节、零填充、ProgramData、payload hash、slot、权限、finalized loader 交易、IDL；它不替代独立可验证构建或远端 CI。
- 运行状态与就绪接口分离；维护就绪为 paused，原存活接口保留。详情页刷新运行状态，暂停新资金动作，冻结阶段不显示可执行的同步/恢复入口。确认框显示网络、测试资产和 Mint。
- 优先明确 Phantom provider，监听账户变化/断开，使用 generation 检查拦截登录/签名期间账户切换。会话 Cookie 可按部署命名，读取、设置、退出统一；签名、广播超时不直接提示重新签名。
- 默认只读的发布工具和手工 Devnet 工作流。测试钱包、程序升级钱包分离，工作流不持有升级密钥，也不部署、铸币或清空数据库。

## 本地验证

| Gate | 结果与边界 |
| --- | --- |
| `pnpm check:full` | 2026-10-09 修复后：Prisma、ESLint、98 单元测试、生产构建、24 数据库集成测试通过 |
| `cargo fmt --manifest-path programs/vesti-escrow/Cargo.toml --check` | 通过，Rust 改动仅格式化 |
| `anchor build --ignore-keys --provider.cluster localnet` | 通过，保留现有 Anchor macro/SBF 工具链警告；运行验证器验证实际执行 |
| `pnpm test:onchain` | 真正本地 Token 转账与失败回滚通过 |
| `pnpm test:chain-integration` | 真实 PostgreSQL/本地链：普通付款、四种争议资金出口、恢复与 finalized 过期通过；Chromium 四出口、广播前持久化/应用重启、D17、D24 通过 |
| `pnpm test:release-upgrade` | 编译仓库实际旧版本 `f436ad4`，用 upgradeable loader 部署并真实同 ID 升级到当前程序；D20 的直接付款及审计失败全回滚、D21 的独立增量退款批次和精确重试、D23 的 legacy→当前普通同步通过 |
| D19 | 两个独立 Prisma 客户端验证共享写锁阻挡维护提交、epoch 切换后晚到写入被拒绝，以及 prepared 不被取消 |
| D22 | 真实 localnet 验证：实际创建的未绑定其他 Mint escrow、预加载历史 Token-2022 escrow 加真实 mintTo、未知 program-owned 布局及截断 RPC 代理均进入报告并阻断升级；未声称 Token-2022 出口兼容 |
| D24 | 两个同时运行的应用、同一 Chromium browser context、独立 Cookie 名与 AUTH_SECRET；分别登录和退出互不覆盖。账户切换的真实扩展验收仍待执行 |

[本地升级摘要](evidence/iteration-3/local-upgrade-20261008.json)、[库存阻断摘要](evidence/iteration-3/inventory-20261008.json)与[浏览器会话隔离摘要](evidence/iteration-3/session-isolation-20261008.json)只证明相应 localnet/浏览器测试。临时密钥、验证器和隔离 schema 在测试后清理；其中交易签名不是 Devnet Explorer 验收证据。

程序部署可见性规则采用固定 Solana 3.1.14 演练记录：部署 slot N，候选代码生效区间从 N+1 起；同 slot 不确定调用保守处理。规则参考[Solana 官方程序执行文档](https://github.com/solana-foundation/solana-com/blob/main/apps/docs/content/docs/en/core/programs/program-execution.mdx)，其他 loader/工具链必须重新证明，不能复用该结论。

## Devnet 验收工具当前覆盖

`pnpm devnet:acceptance` 默认只读预检。显式 `--apply` 才使用三个专用测试钱包执行操作；要求批准 release 为 open、当前 HEAD 等于 manifest 的 sourceCommit、明确测试本金预算。工具默认预算门槛为 17.1 测试 Token（含捐赠），整轮累计注资不得超过指定预算，不进行 airdrop、mint、部署或 DROP schema。

服务密钥流程包含 D01–D10、D14、D17 的正常资金、提案替换、独立进程原签名恢复、finalized 未广播过期和原钱包恢复重试调度。D11 互斥、D12 捐赠退款、D13 RPC 中断、D15 pin 篡改与 D16 八项计划/未知项/部分金额拒绝已实现部分条件，完整 compound 条件仍标 pending。D18–D24 需要相应环境或外部证明；报告保留所有 24 条状态。真实钱包扩展执行方式仍为 pending。

`pnpm devnet:evidence:verify --evidence <path>` 归档 finalized 交易原始 RPC、参与者前后账户窗口及摘要。核验器重新查询交易、核对实际账户绑定、交易 Token 余额、按时间重放的逐步 F/R/Q、数据库唯一投影与本金终态；整体验收仍返回 exit 3。不能将单次服务签名运行、Explorer 可见或本地 fixtures 当作两个 Devnet run/真实扩展 gate 已完成。历史查询完整性、真实扩展、全部故障注入和独立 run 的外部验收仍需补齐后才能关闭整体验收。

## 发布前剩余工作

1. 完成剩余 compound 故障用例及完整 Devnet 原始证据；以最终候选提交重跑受影响 gate。
2. 形成新候选提交，核对锁定程序/IDL/可验证构建与远端 CI；生成实际 release manifest、历史 registry 和经批准的 activation/出口证据。当前设计基线不充当候选 SHA。
3. 确定程序 ID 与升级权限、独立数据库、测试 Mint、公开/私有 RPC、测试资产及 SOL 预算、真实 Phantom 操作者。秘密只引用受控配置位置，不写入文档或聊天。
4. 只读全程序/DB/pending 盘点，所有进程已支持维护协议；生成精确部署预览后独立批准外部部署/测试资金操作。
5. 完成两个独立 Devnet run 与真实 Phantom 四出口、持久化恢复/账户切换。各 gate 单独记录，全部完成后才能标记迭代 3 退出条件通过。

配置与维护命令见[发布运行手册](iteration-3-release-runbook.zh-CN.md)，验收定义见[详细设计](iteration-3-devnet-acceptance-design.zh-CN.md)。


## 2026-10-09 评审修复

- 分离部署前 candidate 和部署后 finalized receipt，追加 `20261009090000_release_deployment_receipt` 迁移保存候选及核验结果。
- 进入 deploying 再验证库存批准；冻结窗口有直接链动作时旧摘要拒绝。升级测试改走实际维护服务及 open gate，不直接写阶段。
- onchain CI 获取完整历史，升级测试固定完整 predecessor SHA。
- 公开配置和 readiness 共享 5 秒观测缓存及数据库 30/min 探测预算；失败刷新不复用旧 ready，资金身份/epoch 检查保持实时。

修复回归：真实本地 JSON-RPC 复现中，35 次匿名公开配置调用从原来的 210 次 RPC 读取降为 6 次；跨应用实例共享探测预算、缓存过期后的失败刷新及二次身份探测失败均被覆盖。缓存仍有效时，独立资金身份检查能够拒绝已变化的程序。真实升级演练通过实际维护服务验证旧库存批准失效、候选批准、finalized 部署回执绑定、转换回滚/重试及重新开放门槛；真实库存阻断测试通过。新增迁移仅在隔离测试 schema 中应用，未迁移主库。

修复后的 `pnpm test:chain-integration` 通过真实 PostgreSQL/localnet 与 Chromium 回归，涵盖注资、普通付款、四种争议资金出口、广播前持久化与应用重启恢复、过期重试以及会话隔离。最新[本地维护与升级摘要](evidence/iteration-3/local-upgrade-20261009.json)记录实际维护阶段门槛；仅为 localnet 证据。

本次修复不代表 Devnet、真实 Phantom 或剩余组合故障验收完成，也未提交或推送。

提交评审尾项已修复：可见性修改在同一写入中递增 businessRevision，响应返回已提交的新版本；重复 prepare 在维护阶段只返回既有状态、不返回可签消息，保留钱包、参数和发布身份检查，新操作仍拒绝。新增数据库回归验证响应与存储版本一致、open 正常返回原消息、四个维护阶段仅查询、原交易不被修改及错误钱包/参数/缺失发布记录被拒绝。该状态读取不授权签名保存、广播或资金投影。
