# Vesti 运行指南

[English](operations.md) | [简体中文](operations.zh-CN.md)

本文档说明离线 MVP 的本地运行方式。

## 本地启动

1. 安装依赖。

```bash
corepack pnpm install
```

2. 复制环境变量文件。

```bash
copy .env.example .env
```

3. 使用 Docker 启动 PostgreSQL。

```bash
docker compose up -d postgres
docker compose ps
```

4. 确认 `DATABASE_URL` 指向本地数据库。

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vesti
```

5. 生成 Prisma Client 并迁移数据库。

```bash
corepack pnpm prisma generate
corepack pnpm prisma migrate dev --name init
```

6. 启动应用。

```bash
corepack pnpm dev
```

如果 Windows 排除了端口 `3000`，使用：

```bash
corepack pnpm exec next dev -H 127.0.0.1 -p 3100
```

## Docker 数据库

Compose 文件只启动 PostgreSQL。应用继续在本机使用 `corepack pnpm dev` 运行。

```bash
docker compose up -d postgres
docker compose logs -f postgres
docker compose down
```

仅在需要重置全部本地数据库数据时使用：

```bash
docker compose down -v
```

## 合约流程

1. 以需求方身份打开 `/dashboard`。
2. 连接钱包并签名登录，然后创建合约。
3. 以需求方身份为合约注资；也可以在草稿状态取消合约。
4. 注资后切换到工作者。
5. 打开合约详情页，为已就绪的里程碑提交证明。
6. 切换回需求方。
7. 批准已提交的里程碑，或填写修改说明并请求修改。
8. 如果请求了修改，切换到工作者并提交新版本证明。
9. 可选：付款释放前，由需求方或工作者发起争议。
10. 在 Mock 模式下，一方提出释放或退款方案，另一方接受。
11. 没有未解决争议时，切回需求方，批准最新证明并释放付款。
12. 确认金额进度、证明历史、交易状态和事件时间线均已更新。

链上争议操作会保持禁用，直至实现链上结算指令。这样可以避免数据库记录一个链上并不存在的冻结托管状态。

## 质量检查

提交前运行：

```bash
corepack pnpm check
```

PostgreSQL 运行且迁移可用时，执行完整验证：

```bash
corepack pnpm check:full
```

`check` 会校验 Prisma 结构、执行 Lint、单元测试和生产构建；`check:full` 还会运行数据库集成测试。CI 会对 Pull Request 与 `main` 分支更新执行相同检查。

部署就绪探针可调用 `POST /api/health`。健康响应会确认数据库可连接，并返回当前托管模式和网络；该接口不验证 Solana RPC 可用性。

## 运营任务

链上部署至少每分钟调度一次对账命令：

```bash
corepack pnpm reconcile:transactions
```

每次运行会原子租用最多 `RECONCILIATION_BATCH_SIZE` 条已提交交易。对账失败后按指数退避重试；达到 `RECONCILIATION_MAX_ATTEMPTS` 后，记录继续保持已提交状态并标记为人工检查，不会被静默丢弃，也不会错误报告为链上失败。

无签名的 `prepared` 注资或付款由用户在详情页恢复。服务端只有在finalized 区块高度越过 lastValidBlockHeight、原链身份仍一致，并核实完整 finalized 历史仍未发生对应资金变化后，才释放旧操作锁。若标记 `requiresReviewAt`，先核对托管账户、链上交易和本地事件；不要直接清除操作锁或重发付款。RPC 检查失败时保留原记录，稍后重试。

每日调度运营数据清理：

```bash
corepack pnpm cleanup:operational
```

清理任务只删除过期的限流桶，以及超过保留时间的认证挑战；不会删除合同、事件、证明、争议或资金交易记录。部署调度器必须避免清理任务重叠运行，并对两个命令的非零退出码告警。

认证限流按 `CF-Connecting-IP`、`X-Real-IP`、`X-Forwarded-For` 的顺序读取客户端地址。应用只能通过会覆盖这些请求头的反向代理对外提供服务，不能追加或透传客户端自行提交的值。匿名 challenge/verify 只消耗客户端预算；钱包预算仅在签名有效且挑战被原子领取后消耗。未能区分客户端的部署会共享客户端预算，应先配置可信代理。

运行 `corepack pnpm build` 前先停止开发服务器，完成后再重新启动。如果本地开发页面突然丢失 CSS，请停止开发服务器、清理 `.next`，然后重新启动。

## 链上程序

Rust/Anchor 程序位于 `programs/vesti-escrow`。程序边界兼容 Token/Token-2022，但当前 Web 交易构建器仅面向经典 SPL Token Program。在 `ESCROW_ADAPTER_MODE=onchain` 模式下，Web 应用准备交易、提交钱包签名的 Solana 交易，并在推进本地合约状态前对账最终托管状态。

离线 MVP 不需要 Anchor。开始真实 Solana 程序工作时，请使用本仓库最新验证过的技术栈，不要降级依赖：

```bash
anchor --version          # anchor-cli 1.0.2
solana --version          # solana-cli 3.1.14
cargo build-sbf --version # solana-cargo-build-sbf 3.1.14
```

在 Ubuntu 22.04 上，AVM 预编译的 Anchor 1.0.2 可能需要比系统自带版本更新的 GLIBC。遇到此问题时，从源码编译 Anchor CLI：

```bash
cargo install --git https://github.com/solana-foundation/anchor --tag v1.0.2 anchor-cli --force
```

然后验证程序：

```bash
cargo fmt --manifest-path programs/vesti-escrow/Cargo.toml
cargo check --manifest-path programs/vesti-escrow/Cargo.toml
anchor build
```

当前链上状态和后续任务见 [onchain.zh-CN.md](onchain.zh-CN.md)。

## Web 链上协议与本地争议验收

新增迁移 `20260930090000_web_chain_disputes` 只增加字段和证据表。先执行 `corepack pnpm prisma generate` 和 `corepack pnpm prisma migrate deploy`。Mock 流程保持可用。旧 prepared 或同一合约存在多个 pending 操作会隔离为 review；历史签名、幂等键和金额不会删除。单一旧 submitted/confirmed 可按完整 finalized 历史核对；缺失或不一致的历史需要离线核查，不提供忽略异常按钮。

链上注资和付款必须显式配置 `ESCROW_NETWORK_GENESIS_HASH`、`ESCROW_PROGRAM_SHA256`。`corepack pnpm chain:identity` 只读查询当前网络和已部署程序的标识；核对预期部署版本后再写入配置。可升级程序的 hash 包括 ProgramData 头之后的完整字节（包含部署空间填充），不是 `.so` 文件的 hash。网络重置或程序升级后必须重新核查，不能自动更新 pin。

争议默认关闭。仅 `NEXT_PUBLIC_SOLANA_NETWORK=localnet`、`ESCROW_CHAIN_DISPUTES_ENABLED=true` 且网络、程序和经典六位 Mint 检查均通过时开放。Devnet 升级与验收属于下一迭代。

```bash
corepack pnpm exec playwright install chromium
corepack pnpm test:chain-integration
```

测试命令启动专用本地验证器、使用隔离的 `vesti_chain_integration_test` PostgreSQL schema、临时测试 Mint/钱包和 18990 端口的 Web 服务；退出时清理这些资源。要求本地 PostgreSQL、Solana CLI 和已构建的 `programs/vesti-escrow/target/deploy/vesti_escrow.so`。可用 `VESTI_TEST_RPC_PORT` 和 `VESTI_BROWSER_TEST_PORT` 调整端口。测试不使用现有 Devnet 资金或部署账户。验证器默认 16 ticks/slot；设置 `VESTI_TEST_TICKS_PER_SLOT=64` 可按标准时序复跑。浏览器测试钱包通过注入 provider 签署真实消息和交易，不代表 Phantom/Solflare 兼容性已验收。

恢复命令仍是 `corepack pnpm reconcile:transactions`。它覆盖 building 超时、prepared 有效期、signed 重播、submitted/confirmed 核对，以及已绑定合约和活跃合约的直接链上扫描。过期必须在 finalized 区块高度越过有效期后核查完整历史；RPC null、短暂失败或租约超时都不会直接解锁资金操作。review 保留最后已验证本金账本和锁，degraded 可重试同步。签名字节只由原操作钱包读写服务使用，不出现在通用合约 DTO。

同步按 slot、区块交易位置和指令位置重放，并在投影事务中检查 businessRevision 与执行租约。当前实现为了保守核对，每次从初始化开始重放，单次最多扫描 20,000 条相关签名；超过上限、历史被裁剪、未知 CPI 或不支持的交易 envelope 会隔离，后续生产迭代再处理规模化历史存档。金库额外 Token 记录在 chainBaselineEvidence.extraTokenUnits，不计入可释放或可退款本金。

回退应先关闭争议开关、暂停新准备，同时保留兼容恢复器处理已保存的签名。不要直接删除新列、证据表或 pending 记录；已签名交易在有效期内仍可能落链。

## 安全修复后的升级边界

新初始化使用 `initialize_escrow_v2` / `initialize_escrow_with_arbitrator_v2`，地址种子为 `[escrow_v2, creator, contractId]` 和 `[vault_v2, creator, contractId]`。第三方不能占用创建者地址。同一初始化事务保存不可修改的里程碑计划，最多 8 项，金额总和必须等于合同总额；未知里程碑和部分里程碑付款被拒绝。部署 Web 前必须先部署匹配的程序并人工更新程序身份 pin，否则保持停止新交易。

旧账户结构与 PDA 签名种子保持兼容，已有账户仍能注资、付款、协商退款和仲裁退款。旧账户没有不可修改的里程碑计划，继续遵循旧协议；既有未知里程碑或部分金额造成的账本冲突仍需人工核对，不能直接清除 review。系统只在持久化 escrowAccount 明确绑定旧地址时使用旧协议，不自动退回公共旧地址初始化。升级前必须完成或逐笔核对 pending 交易；旧初始化指令已停用。

`RECONCILIATION_RETRY_LIMIT` 不代表资金操作失败。原签名者可通过详情页重试，服务端先验证原链身份和 finalized 历史，再重置重试预算；其他 review 不会因此解锁。仲裁者只能恢复自己的操作。网络、Mint、程序或程序代码变化时，旧交易不能在新身份下重播或按新链高度过期。

头像仅接受经过实际解码并重新编码的 PNG/JPEG/WebP，存储和响应均为有尺寸限制的 PNG；旧 SVG 或伪装内容返回 404。上线时清理 `/api/profile/avatar` 的旧 CDN/代理缓存，尤其一年 immutable 的版本化 URL；否则缓存可能继续提供升级前响应。该清理尚未执行。
