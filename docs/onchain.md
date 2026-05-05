# Vesti On-chain Escrow

This document tracks the Rust/Solana phase for Vesti.

## Current Status

The repository contains an Anchor-style Rust program scaffold in:

```text
programs/vesti-escrow/
```

The scaffold defines escrow state, vault token accounts, and Token/Token-2022 compatible transfer
boundaries. It is ready for Anchor tests and Web wallet-signing integration, but it has not been
deployed yet.

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

`mark_funded` transfers the full contract amount from the Creator token account into the vault.
`release_milestone` transfers the approved milestone amount from the vault to the Worker token
account, signed by the escrow PDA.

## Next On-chain Tasks

- Add Anchor tests for initialize, fund, release, and dispute.
- Wire `lib/blockchain/solana-escrow-adapter.ts` to wallet signing and transaction submission.
- Generate and deploy a real program keypair on localnet/devnet.
- Add client-side PDA derivation and token account resolution.

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
```
