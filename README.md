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
  -> Approve milestone
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
      milestones/
        submit-proof/route.ts
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
POST /api/milestones/submit-proof
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

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vesti
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SOLANA_NETWORK=devnet
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_USDC_MINT=
ESCROW_ADAPTER_MODE=mock
ESCROW_PROGRAM_ID=
```

## Development

```bash
pnpm install
pnpm prisma generate
pnpm prisma migrate dev
pnpm dev
pnpm lint
```

## MVP Rules

- Only the Creator can fund, approve, and release payments.
- Only the assigned Worker can submit proof.
- Milestone amounts must add up to the contract total.
- Released amount cannot exceed funded amount.
- Released milestones cannot be released again.
- Proof submissions must keep version history.
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

The repository is currently in the planning stage. The recommended first implementation is a Next.js app with PostgreSQL, Prisma, and a mocked escrow adapter.
