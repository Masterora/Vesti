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

无签名的 `prepared` 注资或付款由用户在详情页恢复。服务端只有在原区块哈希失效、准备记录写入已满 5 分钟，并核实 finalized 链上状态仍未发生对应资金变化后，才释放旧操作锁。若标记 `requiresReviewAt`，先核对托管账户、链上交易和本地事件；不要直接清除操作锁或重发付款。RPC 检查失败时保留原记录，稍后重试。

每日调度运营数据清理：

```bash
corepack pnpm cleanup:operational
```

清理任务只删除过期的限流桶，以及超过保留时间的认证挑战；不会删除合同、事件、证明、争议或资金交易记录。部署调度器必须避免清理任务重叠运行，并对两个命令的非零退出码告警。

认证限流按 `CF-Connecting-IP`、`X-Real-IP`、`X-Forwarded-For` 的顺序读取客户端地址。应用只能通过会覆盖这些请求头的反向代理对外提供服务，不能追加或透传客户端自行提交的值；如果部署环境无法保证这一边界，应以钱包维度限流作为主要控制手段。

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
