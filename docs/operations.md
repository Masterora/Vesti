# Vesti Operations

[English](operations.md) | [简体中文](operations.zh-CN.md)

This guide covers local operation for the off-chain MVP.

## Start Locally

1. Install dependencies.

```bash
corepack pnpm install
```

2. Copy environment variables.

```bash
copy .env.example .env
```

3. Start PostgreSQL with Docker.

```bash
docker compose up -d postgres
docker compose ps
```

4. Make sure `DATABASE_URL` points to the local database.

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vesti
```

5. Generate Prisma Client and migrate the database.

```bash
corepack pnpm prisma generate
corepack pnpm prisma migrate dev --name init
```

6. Start the app.

```bash
corepack pnpm dev
```

If Windows excludes port `3000`, use:

```bash
corepack pnpm exec next dev -H 127.0.0.1 -p 3100
```

## Docker Database

The compose file only starts PostgreSQL. Keep the app running locally with `corepack pnpm dev`.

```bash
docker compose up -d postgres
docker compose logs -f postgres
docker compose down
```

Use this only when you want to reset all local database data:

```bash
docker compose down -v
```

## Contract Workflow

1. Open `/dashboard` as Creator.
2. Connect and sign in with a wallet, then create a contract.
3. Fund the contract as Creator, or cancel it while it is still a draft.
4. Switch to Worker after funding.
5. Open the contract detail page and submit proof for a ready milestone.
6. Switch back to Creator.
7. Either approve the submitted milestone or write a revision note and request revision.
8. If revision is requested, switch to Worker and submit a new proof version.
9. Optionally open a dispute as Creator or Worker before payment is released.
10. In mock mode, one participant proposes release or refund and the other participant accepts.
11. Switch back to Creator, approve the latest proof, and release payment when no dispute is open.
12. Confirm amount progress, proof history, transaction status, and Event Timeline updates.

On-chain dispute actions are intentionally disabled until an on-chain settlement instruction is
implemented. This prevents the database from reporting a frozen escrow state that does not exist
on-chain.

## Quality Checks

Run these before committing:

```bash
corepack pnpm check
```

When PostgreSQL is running and migrations are available, run the full verification suite:

```bash
corepack pnpm check:full
```

`check` validates the Prisma schema, lints, runs unit tests, and builds the production application. `check:full` additionally runs the database-backed integration suite. CI runs the same checks for pull requests and updates to `main`.

Deployment readiness can probe the application with `POST /api/health`. A healthy response confirms database connectivity and reports the configured escrow mode and network; it does not validate Solana RPC availability.

## Operational Jobs

In on-chain deployments, schedule the reconciliation command at least once per minute:

```bash
corepack pnpm reconcile:transactions
```

Each run atomically leases up to `RECONCILIATION_BATCH_SIZE` submitted transactions. Failed reconciliation uses exponential backoff. After `RECONCILIATION_MAX_ATTEMPTS`, the record remains submitted and is marked for manual review rather than being silently discarded or reported as failed on-chain.

Users recover unsigned `prepared` funding or payment from contract details. The server releases the old operation lock only after the blockhash expires, at least five minutes have passed since the preparation was written, and finalized chain state shows no corresponding funds movement. For records marked `requiresReviewAt`, inspect the escrow account, chain transactions, and local events before taking action; do not clear the operation lock or resend payment directly. RPC failures leave the record in place for a later retry.

Schedule operational cleanup daily:

```bash
corepack pnpm cleanup:operational
```

Cleanup only removes expired rate-limit buckets and authentication challenges older than the retention window. It does not delete contracts, events, proofs, disputes, or financial transaction records. The deployment scheduler must prevent overlapping cleanup runs and alert on non-zero exit codes from both commands.

Authentication rate limiting reads `CF-Connecting-IP`, `X-Real-IP`, and `X-Forwarded-For` in that order. Only expose the application through a reverse proxy that overwrites these headers; never append or pass through client-supplied values. Wallet-level limits remain the primary control when the deployment cannot guarantee that boundary.

Stop the dev server before running `corepack pnpm build`, then restart it afterward. If a page suddenly renders without CSS during local development, stop the dev server, clear `.next`, and start it again.

## On-chain Program

The Rust/Anchor program is in `programs/vesti-escrow`. It defines Token/Token-2022 compatible
program boundaries, while the current Web transaction builder targets the classic SPL Token Program. In
`ESCROW_ADAPTER_MODE=onchain`, the web app prepares transactions, submits wallet-signed Solana
transactions, and reconciles the resulting escrow state before local contract state advances.

Anchor is not required for the off-chain MVP. When starting real Solana program work, use the
latest validated stack for this repo instead of downgrading dependencies:

```bash
anchor --version          # anchor-cli 1.0.2
solana --version          # solana-cli 3.1.14
cargo build-sbf --version # solana-cargo-build-sbf 3.1.14
```

On Ubuntu 22.04, the AVM prebuilt Anchor 1.0.2 binary may require a newer GLIBC than the distro
ships. If that happens, compile Anchor CLI from source:

```bash
cargo install --git https://github.com/solana-foundation/anchor --tag v1.0.2 anchor-cli --force
```

Then validate the program with:

```bash
cargo fmt --manifest-path programs/vesti-escrow/Cargo.toml
cargo check --manifest-path programs/vesti-escrow/Cargo.toml
anchor build
```

See `docs/onchain.md` for the current on-chain status and next tasks.
