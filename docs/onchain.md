# Vesti On-chain Escrow

This document tracks the Rust/Solana phase for Vesti.

## Current Status

The repository contains an Anchor-style Rust program scaffold in:

```text
programs/vesti-escrow/
```

The scaffold defines escrow state and instruction boundaries, but it does not yet perform real
USDC token transfers.

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
initialize_escrow(contract_id, creator, worker, total_amount)
mark_funded(amount)
release_milestone(milestone_id, amount)
open_dispute(milestone_id, reason)
```

## Next On-chain Tasks

- Add SPL Token / Token-2022 vault accounts.
- Validate `NEXT_PUBLIC_USDC_MINT`.
- Transfer USDC into escrow on fund.
- Transfer USDC from escrow to Worker on release.
- Add Anchor tests for initialize, fund, release, and dispute.
- Wire `lib/blockchain/solana-escrow-adapter.ts` to wallet signing and transaction submission.

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
