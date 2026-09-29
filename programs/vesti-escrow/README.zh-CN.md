# Vesti 托管程序

[English](README.md) | [简体中文](README.zh-CN.md)

这是 Vesti 链上托管的 Rust/Anchor 程序。它仅接受经典 SPL Token Program，保留原有 `EscrowState` 布局。

当前程序保存托管状态、创建金库 Token 账户，并实现以下指令模型：

- `initialize_escrow`
- `mark_funded`
- `release_milestone`
- `open_dispute`
- `propose_resolution`、`accept_release_resolution`、`accept_refund_resolution`
- `initialize_escrow_with_arbitrator`、`arbitrate_release_resolution`、`arbitrate_refund_resolution`

`initialize_escrow` 创建默认「双方协商」托管；`initialize_escrow_with_arbitrator` 额外创建不可更换的 `["policy", escrow]` PDA，预先绑定独立仲裁钱包。双方仍可协商；只有指定仲裁钱包可单独裁决。默认模式若无协议，资金持续冻结。旧托管账户无策略 PDA 时仍按默认规则处理。

`mark_funded` 注资，`release_milestone` 普通付款。`open_dispute` 冻结整个托管，原因正文不进链；链上不能独立证明数据库里程碑的归属。提议、接受和仲裁结算均限制身份、Mint、金库及收款 Token 账户。争议释放与普通付款共用 `["release", escrow, SHA256(milestone_id)]` 凭证。退款退还全部未释放本金，置托管为 `CANCELLED`。`contract_id` 作为 PDA Seed，不得超过 32 字节。

Web 应用默认使用 Mock 托管适配器，支持创建时选定的仲裁规则。链上争议入口仍关闭；本轮已在本地验证器验证资金转账，尚未把新程序升级到 Devnet。命令与边界见[链上托管文档](../../docs/onchain.zh-CN.md)。
