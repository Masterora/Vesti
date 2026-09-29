# Vesti Escrow Program

[English](README.md) | [简体中文](README.zh-CN.md)

This is Vesti's Rust/Anchor escrow program. It accepts only the classic SPL Token Program and preserves the existing `EscrowState` layout.

The current program stores escrow state, creates a vault token account, and models these
instructions:

- `initialize_escrow`
- `mark_funded`
- `release_milestone`
- `open_dispute`
- `propose_resolution`, `accept_release_resolution`, `accept_refund_resolution`
- `initialize_escrow_with_arbitrator`, `arbitrate_release_resolution`, `arbitrate_refund_resolution`

`initialize_escrow` selects mutual agreement by default. `initialize_escrow_with_arbitrator` also creates an immutable `["policy", escrow]` PDA binding a separate arbitrator wallet. Both parties may still agree on settlement; only the named wallet can decide alone. Funds remain frozen without agreement under the default policy. Existing escrows without a policy PDA keep the default behavior.

`mark_funded` deposits principal and `release_milestone` pays a milestone. `open_dispute` freezes the whole escrow and stores only a reason hash. The program cannot independently verify a database milestone's membership. Proposal, acceptance, and arbitration settlement constrain signatures, mint, vault, and destination token accounts. Dispute releases share the `["release", escrow, SHA256(milestone_id)]` receipt with ordinary payments. A refund returns all unreleased principal and makes the escrow `CANCELLED`. `contract_id` is a PDA seed limited to 32 bytes.

The Web app defaults to the Mock adapter and supports the selected arbitration policy there. Its on-chain dispute entry point remains disabled. Real token transfers have passed local validator tests; the new program has not been upgraded on Devnet. See the [on-chain guide](../../docs/onchain.md) for commands and limits.
