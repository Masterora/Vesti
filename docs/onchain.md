# Vesti On-chain Escrow

This document tracks the Rust/Solana phase for Vesti.

## Current Status

The repository contains an Anchor-style Rust program scaffold in:

```text
programs/vesti-escrow/
```

The scaffold defines escrow state, vault token accounts, and Token/Token-2022 compatible transfer
boundaries. The Web app can derive the matching PDAs, associated token accounts, and USDC token
units, but wallet signing and transaction submission are not wired yet. The program has not been
deployed.

## Program ID

Current placeholder program id:

```text
FPAahm7kTaMhtQWM2DjYnUFkWaYviMVitJFxyh1nAWFQ
```

Before deployment, generate a real program keypair and update:

- `Anchor.toml`
- `programs/vesti-escrow/src/lib.rs`
- `.env` / `.env.example` `ESCROW_PROGRAM_ID`

## Instructions

```text
initialize_escrow(contract_id, worker, total_amount)
mark_funded(amount)
release_milestone(milestone_id, amount)
open_dispute(milestone_id, reason)
```

`initialize_escrow` creates:

- escrow PDA: `["escrow", contract_id]`
- vault token account PDA: `["vault", contract_id]`

`contract_id` is used directly as a PDA seed, so it must be 32 bytes or less. The current Prisma
`cuid()` contract ids fit this limit.

`mark_funded` transfers the full contract amount from the Creator token account into the vault.
`release_milestone` transfers the approved milestone amount from the vault to the Worker token
account, signed by the escrow PDA.

The Web-side derivation helpers live in:

```text
lib/blockchain/solana-escrow-accounts.ts
```

## Next On-chain Tasks

- Add Anchor tests for initialize, fund, release, and dispute.
- Wire `lib/blockchain/solana-escrow-adapter.ts` to wallet signing and transaction submission.
- Generate and deploy a real program keypair on localnet/devnet.
- Build Anchor instruction serialization in the Web adapter.

## Local Commands

Anchor is required for program builds.

```bash
anchor build
anchor test
```

If Anchor is not installed, keep validating the Web app with:

```bash
corepack pnpm prisma validate
corepack pnpm lint
corepack pnpm build
cargo check --manifest-path programs/vesti-escrow/Cargo.toml
```
