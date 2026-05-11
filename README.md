# Vesti

Vesti is a USDC milestone escrow MVP for remote work collaboration.

Creators can publish public projects, accept a worker claim, fund escrow, and release milestone payments. Workers can browse open projects, claim a project, submit proof for each milestone, and get paid on-chain after approval.

## Scope

Vesti focuses on:

- Wallet-based identity
- Public project publishing
- Project claim and creator acceptance
- Multi-milestone escrow
- Contract funding
- Proof submission
- Creator approval
- Milestone payment release
- Dashboard and contract detail views
- Event timeline and status tracking

## Roles

- Creator: publishes the project, accepts a worker claim, funds escrow, reviews proof, and releases payments.
- Worker: claims an open project, completes milestones, and submits proof.

Roles are determined by wallet address.

## Workflow

```text
Publish project
  -> Worker claims project
  -> Creator accepts worker
  -> Fund contract
  -> Submit proof
  -> Request revision when needed
  -> Approve milestone
  -> Open dispute when needed
  -> Release payment
  -> Track events
```

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- Solana Wallet Adapter
- PostgreSQL
- Prisma
- Zod
- Rust
- Solana Program
- Anchor

The Solana program lives in [`programs/vesti-escrow`](programs/vesti-escrow). It is currently validated with Anchor CLI 1.0.2 and Agave/Solana CLI 3.1.14. See [`docs/onchain.md`](docs/onchain.md) for deployment and operational details.

## Target Project Structure

```text
vesti/
  app/
    dashboard/
      page.tsx
    contracts/
      new/
        page.tsx
      detail/
        page.tsx
    api/
      contracts/
        create/route.ts
        list/route.ts
        get/route.ts
        fund/route.ts
        cancel/route.ts
      milestones/
        submit-proof/route.ts
        request-revision/route.ts
        dispute/route.ts
        approve/route.ts
        release/route.ts
    layout.tsx
    page.tsx
    globals.css
  components/
    contracts/
    milestones/
    timeline/
    ui/
  lib/
    auth/
    blockchain/
    domain/
    services/
    validations/
    db.ts
  prisma/
    schema.prisma
  programs/
    vesti-escrow/
  types/
  public/
```

## API Convention

All MVP API routes use `POST`.

Entity identifiers are passed in the JSON request body instead of dynamic URL segments.

Examples:

```text
POST /api/contracts/create
POST /api/contracts/list
POST /api/contracts/get
POST /api/contracts/claim
POST /api/contracts/accept-claim
POST /api/contracts/fund
POST /api/contracts/cancel
POST /api/contracts/visibility
POST /api/milestones/submit-proof
POST /api/milestones/request-revision
POST /api/milestones/dispute
POST /api/milestones/approve
POST /api/milestones/release
POST /api/transactions/prepare-fund
POST /api/transactions/confirm-fund
POST /api/transactions/prepare-release
POST /api/transactions/confirm-release
```

Example request body:

```json
{
  "contractId": "contract_001",
  "milestoneId": "milestone_001",
  "walletAddress": "creator_wallet_address"
}
```

## Environment Variables

Copy `.env.example` to `.env` and update `DATABASE_URL` for your local PostgreSQL instance.

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vesti
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_USDC_MINT=
ESCROW_ADAPTER_MODE=onchain
ESCROW_PROGRAM_ID=H1cs7KqkmmPXMEppuTa7VrVC1apSaYtqUD5hJekwQqyC
AUTH_SECRET=replace-with-a-long-random-secret
DEMO_WALLET_AUTH_ENABLED=false
```

Set `ESCROW_ADAPTER_MODE=onchain` for devnet wallet-signed escrow flows.

`DEMO_WALLET_AUTH_ENABLED=false` is the secure default. Set it to `true` only when you explicitly
want the demo wallet switcher to bypass signed wallet sessions in a local demo environment.

## Quick Start

Use Node.js 20+ and Corepack.

```bash
corepack pnpm install
docker compose up -d postgres
corepack pnpm prisma generate
corepack pnpm prisma migrate dev --name init
corepack pnpm seed
corepack pnpm dev
```

On Windows, if port `3000` is excluded by the system, run:

```bash
corepack pnpm exec next dev -H 127.0.0.1 -p 3100
```

More detailed local operation notes are available in [`docs/operations.md`](docs/operations.md).

## Docker

The MVP only needs PostgreSQL in Docker. The Next.js app runs locally for faster development.

```bash
docker compose up -d postgres
docker compose ps
```

Use this database URL in `.env`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vesti
```

After the database is healthy, run:

```bash
corepack pnpm prisma migrate dev --name init
corepack pnpm seed
```

To stop the database:

```bash
docker compose down
```

To remove local database data:

```bash
docker compose down -v
```

## On-chain Transaction Flow

For wallet-signed escrow, use the transaction endpoints:

```text
POST /api/transactions/prepare-fund
  -> wallet signs and submits the returned base64 Solana transaction
  -> POST /api/transactions/confirm-fund with txSig

POST /api/transactions/prepare-release
  -> wallet signs and submits the returned base64 Solana transaction
  -> POST /api/transactions/confirm-release with txSig
```

In `ESCROW_ADAPTER_MODE=onchain`, prepare endpoints build Anchor-compatible transactions and
confirm endpoints reconcile both the committed instruction payload and resulting escrow account
state before advancing local contract state.

## Commands

```bash
corepack pnpm dev
corepack pnpm lint
corepack pnpm build
corepack pnpm prisma validate
corepack pnpm prisma generate
corepack pnpm prisma migrate dev
corepack pnpm prisma studio
corepack pnpm seed
docker compose up -d postgres
docker compose down
```

## Commit Style

Use concise conventional commits:

```bash
git add .
git commit -m "feat: add milestone revision workflow"
```

## MVP Rules

- Only the Creator can fund, approve, and release payments.
- Only the Creator can cancel a draft contract.
- Only the assigned Worker can submit proof.
- Milestone amounts must add up to the contract total.
- Released amount cannot exceed funded amount.
- Released milestones cannot be released again.
- Proof submissions must keep version history.
- Creator revision requests move a submitted milestone back to Worker action.
- Creator or Worker can open a dispute on an active unreleased milestone.
- Key actions must be recorded as events.

## Demo Flow

1. Creator connects wallet.
2. Creator creates a contract with multiple milestones.
3. Creator funds the contract.
4. Worker submits proof for a milestone.
5. Creator approves the milestone.
6. Creator releases the milestone payment.
7. Dashboard and contract detail pages show status, progress, and event history.

## Status

This repository contains a runnable wallet-signed devnet escrow flow. The Rust program builds with
Anchor CLI 1.0.2 and Agave/Solana CLI 3.1.14, and it models escrow state, vault token accounts,
and Token/Token-2022 compatible fund/release transfers. The web app prepares transactions, asks
the connected wallet to sign them, submits them to Solana, and reconciles the committed transaction
against the expected escrow instructions and resulting escrow account state before local contract
state advances.

## Commit Checklist

Before committing code changes:

```bash
corepack pnpm prisma validate
corepack pnpm lint
corepack pnpm build
```

If the dev server is running, stop it before `corepack pnpm build` and restart it afterward. Mixing `next dev` and `next build` against the same `.next` directory can leave local pages without CSS until `.next` is cleared.
