# Vesti

Vesti is a USDC milestone escrow MVP for remote work collaboration.

Creators create contracts and fund escrow. Workers submit proof for each milestone. Creators review the submission and release the corresponding payment.

The first version focuses on a complete off-chain MVP with a mocked escrow adapter. Real Solana escrow integration can be added later through the same adapter interface.

## Scope

Vesti focuses on:

- Wallet-based identity
- Contract creation
- Worker assignment
- Multi-milestone escrow
- Contract funding
- Proof submission
- Creator approval
- Milestone payment release
- Dashboard and contract detail views
- Event timeline and status tracking

Vesti does not include:

- Talent marketplace
- Chat
- KYC
- Legal contracts
- Fiat payments
- AI features
- Multi-chain support
- Public profiles or reputation

## Roles

- Creator: creates the contract, funds escrow, reviews proof, and releases payments.
- Worker: completes milestones and submits proof.

Roles are determined by wallet address.

## Workflow

```text
Create contract
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

Optional on-chain phase:

- Rust
- Solana Program
- Anchor

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
POST /api/contracts/fund
POST /api/contracts/cancel
POST /api/milestones/submit-proof
POST /api/milestones/request-revision
POST /api/milestones/dispute
POST /api/milestones/approve
POST /api/milestones/release
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
ESCROW_ADAPTER_MODE=mock
ESCROW_PROGRAM_ID=
```

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

## Demo Operation

The current MVP uses a demo wallet switcher instead of real wallet signing.

```text
Creator: creator_demo_wallet_8pQ7n2
Worker:  worker_demo_wallet_5kL9s1
```

Demo path:

1. Open `/dashboard`.
2. Create a contract or run `corepack pnpm seed`.
3. As Creator, fund the contract, or cancel it while it is still a draft.
4. Switch to Worker and submit proof for a ready milestone.
5. Switch back to Creator and request revision or approve the milestone.
6. If revision is requested, switch to Worker and submit a new proof version.
7. Either party can open a dispute before payment is released.
8. Release the milestone payment after approval.
9. Confirm status, amount progress, proof history, and Event Timeline.

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

This repository contains the off-chain MVP scaffold with a mocked escrow adapter. The next step is to configure PostgreSQL, run the Prisma migration, and test the full demo flow locally.

## Commit Checklist

Before committing code changes:

```bash
corepack pnpm prisma validate
corepack pnpm lint
corepack pnpm build
```
