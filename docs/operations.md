# Vesti Operations

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

6. Optional: create a funded demo contract.

```bash
corepack pnpm seed
```

7. Start the app.

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

## Demo Wallets

The MVP uses a demo wallet switcher before real Solana Wallet Adapter wiring.

```text
Creator: creator_demo_wallet_8pQ7n2
Worker:  worker_demo_wallet_5kL9s1
```

## Demo Flow

1. Open `/dashboard` as Creator.
2. Create a contract, or run `corepack pnpm seed`.
3. Fund the contract as Creator, or cancel it while it is still a draft.
4. Switch to Worker after funding.
5. Open the contract detail page and submit proof for a ready milestone.
6. Switch back to Creator.
7. Either approve the submitted milestone or write a revision note and request revision.
8. If revision is requested, switch to Worker and submit a new proof version.
9. Optionally open a dispute as Creator or Worker before payment is released.
10. Switch back to Creator, approve the latest proof, and release payment.
11. Confirm amount progress, proof history, and Event Timeline updates.

## Quality Checks

Run these before committing:

```bash
corepack pnpm prisma validate
corepack pnpm lint
corepack pnpm build
```

Stop the dev server before running `corepack pnpm build`, then restart it afterward. If a page suddenly renders without CSS during local development, stop the dev server, clear `.next`, and start it again.

## On-chain Program

The Rust/Anchor program is in `programs/vesti-escrow`. It currently defines escrow state,
vault token accounts, and Token/Token-2022 compatible fund/release transfers.

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
