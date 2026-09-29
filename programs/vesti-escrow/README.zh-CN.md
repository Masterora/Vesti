# Vesti 托管程序

[English](README.md) | [简体中文](README.zh-CN.md)

这是 Vesti 链上托管阶段的 Rust/Anchor 程序边界。

当前程序保存托管状态、创建金库 Token 账户，并实现以下指令模型：

- `initialize_escrow`
- `mark_funded`
- `release_milestone`
- `open_dispute`

`initialize_escrow` 创建托管 PDA 和兼容 Token/Token-2022 的金库账户。`mark_funded` 将完整合约金额从需求方 Token 账户转入金库。`release_milestone` 将已批准的里程碑资金从金库转入工作者 Token 账户，并以托管账户和里程碑 ID 哈希创建付款凭证 PDA；同一里程碑的再次付款会失败，凭证账户租金由需求方承担。`contract_id` 作为 PDA Seed 使用，不得超过 32 字节。

Web 应用默认使用 Mock 托管适配器。Solana 适配器已经具备实验性的钱包签名交易链路，但在程序完成部署并通过完整 devnet 端到端验证之前，不应视为生产就绪。
