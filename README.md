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

The Creator chooses a dispute policy before the contract starts: mutual agreement by default, or a separate named arbitrator wallet. In Mock mode, the parties may agree on release or refund; the named arbitrator can also decide. Both policies are implemented in the program and passed local validator tests. The Web on-chain dispute entry point remains disabled until its transaction and database reconciliation flow is complete.

## System design

![Vesti system overview](docs/assets/diagrams/system-overview.png)

The design separates collaboration state from custody state:

- The application owns contracts, milestones, proof history, applications, comments, disputes, and the event timeline.
- The escrow boundary owns funding and release execution. A common adapter keeps mock and on-chain workflows behaviorally aligned.
- Authorization and state transitions are enforced centrally, so pages and API routes cannot invent different business rules.
- Proof submissions and contract events are append-only records. Financial operations use idempotency keys and unique transaction signatures.
- On-chain transactions are prepared for wallet signature and reconciled after confirmation before local financial state advances.

## MVP boundary and readiness

The repository contains a Mock escrow workflow and an experimental wallet-signed Solana funding and release path. The new dispute exits have passed local validator tests, but this program version has not been upgraded on Devnet or validated end to end with real wallets. The product does not currently provide fiat payments, KYC, legal arbitration, multi-chain settlement, or production-grade on-chain dispute resolution.

## Project documentation

- [Technical design](docs/technical-design.md): code structure, domain model, APIs, configuration, and engineering rules.
- [Operations](docs/operations.md): local setup, database lifecycle, contract workflow, and quality checks.
- [On-chain escrow](docs/onchain.md): Solana program status, instructions, deployment identifiers, and program commands.
- [Final delivery plan (Chinese)](docs/final-delivery-plan.zh-CN.md): six iterations and acceptance gates from the current MVP to the first production release.
