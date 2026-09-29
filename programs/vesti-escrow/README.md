# Vesti Escrow Program

[English](README.md) | [简体中文](README.zh-CN.md)

This is the Rust/Anchor program boundary for the Vesti on-chain escrow phase.

The current program stores escrow state, creates a vault token account, and models these
instructions:

- `initialize_escrow`
- `mark_funded`
- `release_milestone`
- `open_dispute`

`initialize_escrow` creates the escrow PDA and a Token/Token-2022 compatible vault account.
`mark_funded` transfers the full contract amount from the Creator token account into the vault.
`release_milestone` transfers approved milestone funds from the vault to the Worker token account.
It creates a receipt PDA keyed by the escrow and milestone ID hash; another release for the same
milestone fails even if funds remain. The Creator pays the receipt account rent.
`contract_id` is used as a PDA seed and must be 32 bytes or less.

The Web app defaults to the mocked escrow adapter. The Solana adapter has an experimental
wallet-signed transaction path, but it is not production-ready until the program is deployed and
the complete devnet flow is validated end to end.
