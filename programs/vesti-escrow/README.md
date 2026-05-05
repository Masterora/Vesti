# Vesti Escrow Program

This is the Rust/Anchor program boundary for the Vesti on-chain escrow phase.

The current program stores escrow state, creates a vault token account, and models these
instructions:

- `initialize_escrow`
- `mark_funded`
- `release_milestone`
- `open_dispute`

`initialize_escrow` creates the escrow PDA and a Token/Token-2022 compatible vault account.
`mark_funded` transfers the full contract amount from the Creator token account into the vault.
`release_milestone` transfers approved milestone funds from the vault to the Worker token account.
`contract_id` is used as a PDA seed and must be 32 bytes or less.

The Web app should continue to use the mocked escrow adapter until the Solana adapter has
wallet signing and transaction submission wired end to end.
