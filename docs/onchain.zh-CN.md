# Vesti 链上托管

[English](onchain.md) | [简体中文](onchain.zh-CN.md)

本文档记录 Vesti 的 Rust/Solana 阶段。

## 当前状态

仓库包含一个 Anchor 风格的 Rust 程序框架：

```text
programs/vesti-escrow/
```

该框架定义托管状态、金库 Token 账户以及兼容 Token/Token-2022 的程序边界。程序已使用 Anchor CLI 1.0.2 和 Agave/Solana CLI 3.1.14 完成构建验证。当前 Web 链路使用经典 SPL Token Program，能够推导对应的 PDA、关联 Token 账户、USDC Token 单位，以及用于注资和付款的 Base64 未签名交易。前端会反序列化准备好的交易，请求已连接钱包签名，将其提交到 Solana，并在推进本地合约状态前，对已提交的指令内容和最终托管账户状态进行对账。程序仍需要完成真实 devnet 部署，并使用已有资金的测试 Mint 进行端到端验证。

## 程序 ID

当前本地程序 ID：

```text
ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck
```

部署到 devnet 前，请使用部署密钥对，并保持以下位置一致：

- `Anchor.toml`
- `programs/vesti-escrow/src/lib.rs`
- `.env` / `.env.example` 中的 `ESCROW_PROGRAM_ID`

## 指令

![链上托管指令](assets/diagrams/onchain-instructions.png)

`initialize_escrow` 创建：

- 托管 PDA：`["escrow", contract_id]`
- 金库 Token 账户 PDA：`["vault", contract_id]`

`contract_id` 会直接用作 PDA Seed，因此不得超过 32 字节。当前 Prisma `cuid()` 合约 ID 满足该限制。

`mark_funded` 将完整合约金额从需求方 Token 账户转入金库。`release_milestone` 使用托管 PDA 签名，将已批准的里程碑金额从金库转入工作者 Token 账户。

Web 端账户推导辅助函数位于：

```text
lib/blockchain/solana-escrow-accounts.ts
```

当前 Web 链路会在付款时创建尚不存在的工作者经典 SPL 关联 Token 账户。Web 构建器尚未实现 Token-2022 账户检测。在配套结算指令和对账流程完成之前，链上争议操作保持禁用。

Web 端 Anchor 指令与交易构建器位于：

```text
lib/blockchain/anchor-encoding.ts
lib/blockchain/solana-escrow-instructions.ts
lib/blockchain/solana-escrow-transactions.ts
```

## 后续链上任务

- 为初始化、注资、付款和争议添加 Anchor 测试。
- 实现链上争议结算和退款指令后，再启用 Web 争议操作。
- 生成真实程序密钥对，并部署到 localnet/devnet。
- 使用真实测试 Mint、Phantom 和 Explorer 可确认的签名验证完整 devnet 流程。
- 在 UI 中保存或展示 Explorer 链接以及更完整的对账诊断信息。

## 本地命令

在 Windows 上使用 WSL 运行 Rust/Solana 工具链。当前验证版本为：

```bash
anchor --version          # anchor-cli 1.0.2
solana --version          # solana-cli 3.1.14
cargo build-sbf --version # solana-cargo-build-sbf 3.1.14
```

宿主机 libc 支持预编译二进制时，可以使用 AVM 安装 Anchor CLI 1.0.2。在 Ubuntu 22.04 上应改为从源码构建：

```bash
cargo install --git https://github.com/solana-foundation/anchor --tag v1.0.2 anchor-cli --force
```

构建链上程序需要 Anchor。

```bash
cargo fmt --manifest-path programs/vesti-escrow/Cargo.toml
cargo check --manifest-path programs/vesti-escrow/Cargo.toml
anchor build
anchor test
```

如果未安装 Anchor，仍需继续验证 Web 应用：

```bash
corepack pnpm prisma validate
corepack pnpm lint
corepack pnpm build
cargo check --manifest-path programs/vesti-escrow/Cargo.toml
```
