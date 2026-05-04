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
3. Fund the contract as Creator.
4. Switch to Worker.
5. Open the contract detail page and submit proof for a ready milestone.
6. Switch back to Creator.
7. Either approve the submitted milestone or write a revision note and request revision.
8. If revision is requested, switch to Worker and submit a new proof version.
9. Switch back to Creator, approve the latest proof, and release payment.
10. Confirm amount progress, proof history, and Event Timeline updates.

## Quality Checks

Run these before committing:

```bash
corepack pnpm prisma validate
corepack pnpm lint
corepack pnpm build
```
