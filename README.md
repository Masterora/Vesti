# Vesti

[English](README.md) | [简体中文](README.zh-CN.md)

Vesti is a milestone-based USDC escrow product for remote work. It gives creators and workers a shared workflow for agreeing on deliverables, recording progress, and releasing payment with a traceable history.

## User perspective

### Creator

A creator can:

- Create a private contract or publish an open project.
- Define multiple milestones whose amounts equal the contract total.
- Select a worker, fund the escrow, and monitor delivery progress.
- Review every proof version, request a revision, approve work, and release payment.
- Open a dispute for an active, unreleased milestone.

### Worker

A worker can:

- Join an invited contract or apply to an open project.
- Review milestone scope, amount, due date, and contract history.
- Submit proof without losing earlier versions.
- Respond to revision requests and track approvals and payments.
- Open a dispute for an active, unreleased milestone.

Wallet addresses identify both roles. A user sees the actions permitted by their role and the current contract state.

## User journey

1. The creator defines the work and its milestones.
2. The worker is invited or accepted from an open-project application.
3. The creator funds the escrow, activating the contract.
4. The worker submits proof for the current milestone.
5. The creator approves the proof or requests a revision.
6. Approved funds are released to the worker.
7. The same cycle continues until every milestone is released.

If collaboration breaks down, either participant can open a dispute. The mock escrow supports a bilateral release-or-refund agreement: one participant proposes an outcome and the other accepts it. On-chain dispute settlement is intentionally unavailable until that behavior is enforced by the Solana program.

## System design

![Vesti system overview](docs/assets/diagrams/system-overview.png)

The design separates collaboration state from custody state:

- The application owns contracts, milestones, proof history, applications, comments, disputes, and the event timeline.
- The escrow boundary owns funding and release execution. A common adapter keeps mock and on-chain workflows behaviorally aligned.
- Authorization and state transitions are enforced centrally, so pages and API routes cannot invent different business rules.
- Proof submissions and contract events are append-only records. Financial operations use idempotency keys and unique transaction signatures.
- On-chain transactions are prepared for wallet signature and reconciled after confirmation before local financial state advances.

## MVP boundary and readiness

The repository contains a complete mock escrow workflow and an experimental wallet-signed Solana devnet funding and release path. Devnet use still requires a deployed program, a test USDC mint, and end-to-end validation. The product does not currently provide fiat payments, KYC, legal arbitration, multi-chain settlement, or production-grade on-chain dispute resolution.

## Project documentation

- [Technical design](docs/technical-design.md): code structure, domain model, APIs, configuration, and engineering rules.
- [Operations](docs/operations.md): local setup, database lifecycle, demo flow, and quality checks.
- [On-chain escrow](docs/onchain.md): Solana program status, instructions, deployment identifiers, and program commands.
