# 迭代 3 发布运行手册

本手册说明已实现工具；命令本身不代表目标环境已批准。Devnet 使用独立数据库、测试钱包和资产，禁止把既有 localnet 数据表改指 Devnet。应用进程不能持有升级密钥。

## 配置

先以追加迁移更新目标数据库。提供 `ESCROW_RELEASE_ID`、`ESCROW_RELEASE_MANIFEST_PATH`、既有 genesis/program hash/程序/Mint pin、独立 `SOLANA_SERVER_RPC_URL`、公开浏览器 RPC。`NEXT_PUBLIC_*` 不能放私有访问凭据。新操作的进程上限 `ESCROW_CHAIN_NEW_OPERATIONS_ENABLED` 默认 false；同时需要数据库发布状态 open 才能准备。

首次初始化 `ChainReleaseControl` 默认 draining，不自动开放。已有 prepared/context 不写入虚假的 epoch；building 先排空，原签名按原身份恢复。旧 Web/Worker 版本不理解新表，必须完成全实例升级或停止旧进程并撤销其写权限。

推荐独立主机名；共用主机名不同端口时，给每个部署不同的 `AUTH_SESSION_COOKIE_NAME`、AUTH_SECRET。Cookie host-only，无父域 Domain。

## 只读预览

```sh
pnpm chain:release:inspect --manifest <approved-manifest.json>
pnpm chain:release:inspect --candidate <deployment-candidate.json>
pnpm chain:release:inventory --manifest <approved-manifest.json>
pnpm chain:release:verify --manifest <approved-manifest.json> --artifact <locked.so> --idl <locked-idl.json>
pnpm chain:release:control
```

manifest 字段按 `lib/blockchain/release-manifest.ts` 的严格 schema 填写。`.so` hash 与 ProgramData payload hash 分开；不能查询当前 hash 后自动批准。IDL/源码/candidate/toolchain/升级权限/activation evidence 必须可复查，独立可验证构建与远端 CI 仍是发布前置项。

inventory 默认返回 exit 3：`unattested` 不算通过。维护 approval schema 在 `release-approval.ts`：绑定当前 inventoryStateSha256、manifest 摘要、完整查询证明、全进程 gate 版本证明、可验证构建证据、activation 摘要和每个 program-owned 账户的关联/真实出口证据摘要。人工复核证据后独立固定该 approval JSON 的 canonical SHA256。空文本、未知/Token-2022 未验证出口、缺账户证明或状态变化均阻断，不用随意字符串替代实际证据。

## 维护与转换

```sh
pnpm chain:release:control --apply --initialize --actor <operator> --batch <batch-id>
pnpm chain:release:control --apply --phase open --next draining --epoch <epoch> --actor <operator> --batch <batch-id>
pnpm reconcile:transactions
pnpm chain:release:control --apply --phase draining --next frozen --epoch <epoch> --evidence <approval.json> --approval <approval-sha256> --actor <operator> --batch <batch-id>
pnpm chain:release:control --apply --phase frozen --next deploying --epoch <epoch> --candidate <deployment-candidate.json> --candidate-approval <candidate-sha256> --evidence <fresh-predeploy-approval.json> --approval <fresh-predeploy-approval-sha256> --actor <operator> --batch <batch-id>
```

部署前 candidate 使用 `release-candidate.ts` 的严格 schema：保留源码、产物/IDL、身份、loader/权限、Mint、前驱、descriptor、工具链与构建证明，排除 `deployedSlot`、`deploymentTxSig`、`activationEvidenceSha256`、`deployedProgram` 四个部署结果字段。inspect 的摘要只是只读预览，不自动批准。人工核对后固定 candidate SHA；进入 deploying 必须提供独立的 candidate 批准与刚重新盘点的库存批准。冻结期间直接链动作改变账户集合或内容时，旧库存摘要拒绝，重新盘点并批准。SQL 无法阻止之后的链上直接动作，实际部署者仍须紧邻部署复核并保留候选兼容出口。

部署后生成带实际 slot/签名/payload 的完整 manifest，更新受控配置，再以最终 manifest 摘要批准进入 rebinding。工具核验 finalized loader 交易、ProgramData、权限、锁定字节与 IDL，并检查最终 manifest 的全部部署前字段仍等于原 candidate；不允许更换源码、产物、身份、前驱或权限。候选及 receipt 保存在发布控制行，target 摘要只在部署后绑定，不能直接写 SQL 绕过。

部署工具不在 Web/验收脚本中执行。经独立批准的部署者用锁定产物部署，记录真实交易及预算，下载并核验程序字节；发布新配置前先确认最终链版本。操作失败保持关闭，禁止直接清锁、批量把 review 改 synced 或回写旧 pin。

进入 rebinding 时进程配置改为目标 manifest。提供 `ESCROW_PROTOCOL_REGISTRY_PATH/SHA256`，注册表前驱链与 descriptor 必须匹配真实旧/新 manifest，固定语义只支持已实现 decoder。未知历史或边界分歧阻断。每条普通 API 后续同步也使用该注册表。

```sh
pnpm chain:release:control --apply --phase deploying --next rebinding --epoch <epoch> --target <final-manifest-sha256> --artifact <locked.so> --idl <locked-idl.json> --actor <operator> --batch <batch-id>
pnpm chain:release:transition --from <old-manifest.json> --contract <contract-id>
pnpm chain:release:transition --apply --from <old-manifest.json> --contract <contract-id> --approval <exact-candidate-sha256> --actor <operator>
```

相同父摘要精确重试返回原审计。维护期间又有新链动作时重新 dry-run，独立批准后增加 `--batch <increment-id>`；同一增量 batchId 不接受其他摘要。多合同部分成功时保持 rebinding，不撤销已应用的本金。完成后重新盘点、核验全部合约当前 replay/head/账本，新的 approval 通过才可 open：

```sh
pnpm chain:release:control --apply --phase rebinding --next open --epoch <epoch> --evidence <fresh-approval.json> --approval <fresh-approval-sha256> --actor <operator> --batch <batch-id>
```

链与 SQL 不具备跨系统原子性；切换期间的新直接操作仍需重新取证、批准和投影。不要把关闭页面当作链已静止。

## Devnet 服务签名验收

使用 `DEVNET_CREATOR_KEYPAIR_PATH`、`DEVNET_WORKER_KEYPAIR_PATH`、`DEVNET_ARBITRATOR_KEYPAIR_PATH` 指向受控的测试密钥文件，三者不同；不要把 JSON 密钥放进命令参数或输出。配置 `DEVNET_ACCEPTANCE_BUDGET_UNITS`，每轮至少 `17100000`（17.1 测试 Token，含捐赠），另准备 SOL 交易费用。只读默认预检不读取密钥或写库：

```sh
pnpm devnet:acceptance
pnpm devnet:acceptance --apply
pnpm devnet:evidence:verify --evidence output/iteration-3/<run-id>/evidence.json
```

每次新 run 新建测试合同，串行执行，不能重用同一正常用例的旧证据。脚本不申请 SOL、不铸币、不部署、不清库；钱包余额由发布操作者先检查。当前证据格式保留 24 项和执行方式，pending/blocked 为 exit 3，不算通过。完整覆盖与已验证边界见[实施记录](iteration-3-delivery.zh-CN.md)。

真实 Phantom 流程仍必须由操作者确认扩展中的网络、账户、金额与消息并签署；测试 provider 和服务 Keypair 不算真实扩展验收。不要自动越过扩展确认 UI。

公开 runtime 观测共享最多 5 秒缓存与数据库全局 30 次/分钟探测预算；缓存过期后失败不会继续返回旧 ready，数据库限流不可用也不会发 RPC。此缓存仅影响界面观测，交易准备/签名记录/恢复及维护 epoch 检查仍实时执行。
