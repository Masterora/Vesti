# Vesti On-chain Escrow

This document tracks the Rust/Solana phase for Vesti.

## Current Status

The repository contains an Anchor-style Rust program scaffold in:

```text
programs/vesti-escrow/
```

The scaffold defines escrow state, vault token accounts, and Token/Token-2022 compatible transfer
boundaries. It builds with Anchor CLI 1.0.2 and Agave/Solana CLI 3.1.14. The Web app can derive
the matching PDAs, associated token accounts, and USDC token units, but wallet signing and
transaction submission are not wired yet. The program has not been deployed.

## Program ID

Current local program id:

```text
H1cs7KqkmmPXMEppuTa7VrVC1apSaYtqUD5hJekwQqyC
```

Before devnet deployment, use the deployment keypair and keep these files in sync:

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

Use WSL for the Rust/Solana toolchain on Windows. The current validated versions are:

```bash
anchor --version          # anchor-cli 1.0.2
solana --version          # solana-cli 3.1.14
cargo build-sbf --version # solana-cargo-build-sbf 3.1.14
```

Anchor CLI 1.0.2 can be installed with AVM when the host libc supports the prebuilt binary. On
Ubuntu 22.04, build it from source instead:

```bash
cargo install --git https://github.com/solana-foundation/anchor --tag v1.0.2 anchor-cli --force
```

Anchor is required for program builds.

```bash
cargo fmt --manifest-path programs/vesti-escrow/Cargo.toml
cargo check --manifest-path programs/vesti-escrow/Cargo.toml
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
