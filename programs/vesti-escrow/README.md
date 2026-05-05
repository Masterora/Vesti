# Vesti Escrow Program

This is the first Rust/Anchor scaffold for the Vesti on-chain escrow phase.

The current program stores escrow state and models these instructions:

- `initialize_escrow`
- `mark_funded`
- `release_milestone`
- `open_dispute`

This scaffold does not yet move SPL tokens. Token vault accounts, USDC mint validation,
associated token accounts, and CPI transfers should be added in the next on-chain iteration.

The Web app should continue to use the mocked escrow adapter until the Solana adapter has
wallet signing and transaction submission wired end to end.
