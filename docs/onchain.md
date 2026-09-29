# Vesti On-chain Escrow

[English](onchain.md) | [简体中文](onchain.zh-CN.md)

This document tracks the Rust/Solana phase for Vesti.

## Current Status

The repository contains an Anchor escrow program in:

```text
programs/vesti-escrow/
```

The program accepts only the classic SPL Token Program and preserves the existing escrow account layout. It now supports dispute release, refund, and an optional named arbitrator. Local builds and real token transfers on a validator pass with Anchor CLI 1.0.2 and Agave/Solana CLI 3.1.14. Web funding creates either the default escrow or a policy PDA for the selected arbitrator, then reconciles instructions, accounts, and balances before advancing the database. The Web on-chain dispute entry point remains disabled pending its wallet and reconciliation flow.

## Program ID

Program ID (an older version is deployed on Devnet; this iteration did not upgrade it):

```text
ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck
```

Before a Devnet upgrade, verify upgrade authority, existing accounts, and exact build output. Keep these files in sync:

- `Anchor.toml`
- `programs/vesti-escrow/src/lib.rs`
- `.env` / `.env.example` `ESCROW_PROGRAM_ID`

## Instructions

![On-chain escrow instructions](assets/diagrams/onchain-instructions.png)

`initialize_escrow` creates:

- escrow PDA: `["escrow", contract_id]`
- vault token account PDA: `["vault", contract_id]`

`contract_id` is used directly as a PDA seed, so it must be 32 bytes or less. The current Prisma
`cuid()` contract ids fit this limit.

`mark_funded` transfers the full contract amount from the Creator token account into the vault.
`release_milestone` transfers the approved milestone amount from the vault to the Worker token
account, signed by the escrow PDA.

Mutual agreement is the default. `initialize_escrow` creates no policy account. Either party may freeze a funded escrow with `open_dispute`. `propose_resolution` records a versioned release or refund proposal, and only the other party may accept it through `accept_release_resolution` or `accept_refund_resolution`. Funds remain frozen if there is no agreement.

The named arbitrator choice uses `initialize_escrow_with_arbitrator` and an immutable `["policy", escrow_pubkey]` PDA. The arbitrator must differ from both parties. The parties retain their mutual settlement path; the named wallet may also use `arbitrate_release_resolution` or `arbitrate_refund_resolution`. Old escrows without a policy PDA use the default. An unavailable arbitrator does not create an automatic exit.

The dispute PDA is `["dispute", escrow_pubkey, SHA256(UTF8(milestone_id))]` and stores a reason hash only. The program cannot verify database milestone membership. Dispute releases and ordinary payments share a `["release", escrow_pubkey, SHA256(UTF8(milestone_id))]` receipt. Refunds send `funded_amount - released_amount` to the Creator and set `CANCELLED`; outstanding principal is then zero. Extra tokens sent to the vault are not part of the principal ledger. The program permits an agreed or arbitrated release up to the remaining principal; the later Web dispute integration must bind that amount to the database milestone.

The Web-side derivation helpers live in:

```text
lib/blockchain/solana-escrow-accounts.ts
```

The Web path creates a missing classic SPL associated token account for the Worker. The program rejects Token-2022 mints at initialization. On-chain dispute actions remain disabled in the Web app. Mock mode honors the selected arbitrator policy.

Web-side Anchor instruction and transaction builders live in:

```text
lib/blockchain/anchor-encoding.ts
lib/blockchain/solana-escrow-instructions.ts
lib/blockchain/solana-escrow-transactions.ts
```

## Next On-chain Tasks

- Add Web on-chain dispute preparation, signing, submission, confirmation, and reconciliation before enabling its entry point.
- Verify the Devnet upgrade authority and existing accounts, then upgrade the exact tested build and validate with test funds. This iteration does not deploy.
- Validate the end-to-end devnet flow with a real test mint, Phantom, and explorer-confirmed signatures.
- Persist or surface explorer links and richer reconciliation diagnostics in the UI.

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
anchor build --ignore-keys --provider.cluster localnet
corepack pnpm test:onchain
```

The repository test keypair differs from the deployed program ID. `--ignore-keys` is for local builds, and the validator loads the declared ID explicitly. Do not run `anchor keys sync` over the deployed ID. The `Anchor.toml` test script uses a local validator, not Devnet.

If Anchor is not installed, keep validating the Web app with:

```bash
corepack pnpm prisma validate
corepack pnpm lint
corepack pnpm build
cargo check --manifest-path programs/vesti-escrow/Cargo.toml
```
