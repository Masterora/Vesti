use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};

declare_id!("H1cs7KqkmmPXMEppuTa7VrVC1apSaYtqUD5hJekwQqyC");

pub const STATUS_INITIALIZED: u8 = 0;
pub const STATUS_FUNDED: u8 = 1;
pub const STATUS_DISPUTED: u8 = 2;
pub const STATUS_COMPLETED: u8 = 3;

#[program]
pub mod vesti_escrow {
    use super::*;

    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        contract_id: String,
        worker: Pubkey,
        total_amount: u64,
    ) -> Result<()> {
        let creator = ctx.accounts.creator.key();

        require!(!contract_id.is_empty(), VestiEscrowError::EmptyContractId);
        require!(
            contract_id.len() <= EscrowState::MAX_CONTRACT_ID_LEN,
            VestiEscrowError::ContractIdTooLong
        );
        require!(creator != worker, VestiEscrowError::InvalidParticipants);
        require!(total_amount > 0, VestiEscrowError::InvalidAmount);

        let escrow = &mut ctx.accounts.escrow;
        escrow.contract_id = contract_id;
        escrow.creator = creator;
        escrow.worker = worker;
        escrow.usdc_mint = ctx.accounts.usdc_mint.key();
        escrow.vault = ctx.accounts.vault.key();
        escrow.total_amount = total_amount;
        escrow.funded_amount = 0;
        escrow.released_amount = 0;
        escrow.status = STATUS_INITIALIZED;
        escrow.bump = ctx.bumps.escrow;
        escrow.vault_bump = ctx.bumps.vault;

        emit!(EscrowInitialized {
            contract_id: escrow.contract_id.clone(),
            escrow: escrow.key(),
            vault: escrow.vault,
            creator: escrow.creator,
            worker: escrow.worker,
            usdc_mint: escrow.usdc_mint,
            total_amount,
        });

        Ok(())
    }

    pub fn mark_funded(ctx: Context<FundEscrow>, amount: u64) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        require!(
            amount == escrow.total_amount,
            VestiEscrowError::InvalidAmount
        );
        require!(
            escrow.status == STATUS_INITIALIZED,
            VestiEscrowError::InvalidStatus
        );

        token_interface::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.creator_token_account.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.creator.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;

        escrow.funded_amount = amount;
        escrow.status = STATUS_FUNDED;

        emit!(EscrowFunded {
            contract_id: escrow.contract_id.clone(),
            escrow: escrow.key(),
            creator: escrow.creator,
            vault: escrow.vault,
            amount,
        });

        Ok(())
    }

    pub fn release_milestone(
        ctx: Context<ReleaseMilestonePayment>,
        milestone_id: String,
        amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        require!(!milestone_id.is_empty(), VestiEscrowError::EmptyMilestoneId);
        require!(
            milestone_id.len() <= EscrowState::MAX_MILESTONE_ID_LEN,
            VestiEscrowError::MilestoneIdTooLong
        );
        require!(amount > 0, VestiEscrowError::InvalidAmount);
        require!(
            escrow.status == STATUS_FUNDED,
            VestiEscrowError::InvalidStatus
        );

        let next_released = escrow
            .released_amount
            .checked_add(amount)
            .ok_or(VestiEscrowError::AmountOverflow)?;
        require!(
            next_released <= escrow.funded_amount,
            VestiEscrowError::ReleaseExceedsFunding
        );

        let signer_seeds: &[&[&[u8]]] =
            &[&[b"escrow", escrow.contract_id.as_bytes(), &[escrow.bump]]];

        token_interface::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.worker_token_account.to_account_info(),
                    authority: escrow.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
            ctx.accounts.usdc_mint.decimals,
        )?;

        escrow.released_amount = next_released;

        if escrow.released_amount == escrow.total_amount {
            escrow.status = STATUS_COMPLETED;
        }

        emit!(MilestoneReleased {
            contract_id: escrow.contract_id.clone(),
            milestone_id,
            escrow: escrow.key(),
            creator: escrow.creator,
            worker: escrow.worker,
            vault: escrow.vault,
            amount,
            released_amount: escrow.released_amount,
            status: escrow.status,
        });

        Ok(())
    }

    pub fn open_dispute(
        ctx: Context<ParticipantEscrowAction>,
        milestone_id: String,
        reason: String,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let actor = ctx.accounts.actor.key();

        require!(
            actor == escrow.creator || actor == escrow.worker,
            VestiEscrowError::Unauthorized
        );
        require!(!milestone_id.is_empty(), VestiEscrowError::EmptyMilestoneId);
        require!(
            milestone_id.len() <= EscrowState::MAX_MILESTONE_ID_LEN,
            VestiEscrowError::MilestoneIdTooLong
        );
        require!(!reason.is_empty(), VestiEscrowError::EmptyDisputeReason);
        require!(
            reason.len() <= EscrowState::MAX_DISPUTE_REASON_LEN,
            VestiEscrowError::DisputeReasonTooLong
        );
        require!(
            escrow.status == STATUS_FUNDED,
            VestiEscrowError::InvalidStatus
        );

        escrow.status = STATUS_DISPUTED;

        emit!(EscrowDisputed {
            contract_id: escrow.contract_id.clone(),
            milestone_id,
            escrow: escrow.key(),
            actor,
            reason,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(contract_id: String)]
pub struct InitializeEscrow<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + EscrowState::INIT_SPACE,
        seeds = [b"escrow", contract_id.as_bytes()],
        bump
    )]
    pub escrow: Account<'info, EscrowState>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init,
        payer = creator,
        token::mint = usdc_mint,
        token::authority = escrow,
        token::token_program = token_program,
        seeds = [b"vault", contract_id.as_bytes()],
        bump
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundEscrow<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.contract_id.as_bytes()],
        bump = escrow.bump,
        has_one = creator @ VestiEscrowError::Unauthorized,
        has_one = usdc_mint @ VestiEscrowError::InvalidMint,
        has_one = vault @ VestiEscrowError::InvalidVault
    )]
    pub escrow: Account<'info, EscrowState>,
    pub creator: Signer<'info>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = creator,
        token::token_program = token_program
    )]
    pub creator_token_account: InterfaceAccount<'info, TokenAccount>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = escrow,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ReleaseMilestonePayment<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.contract_id.as_bytes()],
        bump = escrow.bump,
        has_one = creator @ VestiEscrowError::Unauthorized,
        has_one = worker @ VestiEscrowError::InvalidWorker,
        has_one = usdc_mint @ VestiEscrowError::InvalidMint,
        has_one = vault @ VestiEscrowError::InvalidVault
    )]
    pub escrow: Account<'info, EscrowState>,
    pub creator: Signer<'info>,
    /// CHECK: The worker wallet is constrained by `has_one = worker` and token ownership checks.
    pub worker: UncheckedAccount<'info>,
    pub usdc_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = escrow,
        token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = worker,
        token::token_program = token_program
    )]
    pub worker_token_account: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct ParticipantEscrowAction<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.contract_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, EscrowState>,
    pub actor: Signer<'info>,
}

#[account]
#[derive(InitSpace)]
pub struct EscrowState {
    #[max_len(32)]
    pub contract_id: String,
    pub creator: Pubkey,
    pub worker: Pubkey,
    pub usdc_mint: Pubkey,
    pub vault: Pubkey,
    pub total_amount: u64,
    pub funded_amount: u64,
    pub released_amount: u64,
    pub status: u8,
    pub bump: u8,
    pub vault_bump: u8,
}

impl EscrowState {
    pub const MAX_CONTRACT_ID_LEN: usize = 32;
    pub const MAX_MILESTONE_ID_LEN: usize = 64;
    pub const MAX_DISPUTE_REASON_LEN: usize = 256;
}

#[event]
pub struct EscrowInitialized {
    pub contract_id: String,
    pub escrow: Pubkey,
    pub vault: Pubkey,
    pub creator: Pubkey,
    pub worker: Pubkey,
    pub usdc_mint: Pubkey,
    pub total_amount: u64,
}

#[event]
pub struct EscrowFunded {
    pub contract_id: String,
    pub escrow: Pubkey,
    pub creator: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MilestoneReleased {
    pub contract_id: String,
    pub milestone_id: String,
    pub escrow: Pubkey,
    pub creator: Pubkey,
    pub worker: Pubkey,
    pub vault: Pubkey,
    pub amount: u64,
    pub released_amount: u64,
    pub status: u8,
}

#[event]
pub struct EscrowDisputed {
    pub contract_id: String,
    pub milestone_id: String,
    pub escrow: Pubkey,
    pub actor: Pubkey,
    pub reason: String,
}

#[error_code]
pub enum VestiEscrowError {
    #[msg("Contract id is required.")]
    EmptyContractId,
    #[msg("Contract id is too long.")]
    ContractIdTooLong,
    #[msg("Milestone id is required.")]
    EmptyMilestoneId,
    #[msg("Milestone id is too long.")]
    MilestoneIdTooLong,
    #[msg("Creator and Worker must be different.")]
    InvalidParticipants,
    #[msg("Amount is invalid.")]
    InvalidAmount,
    #[msg("Amount overflow.")]
    AmountOverflow,
    #[msg("Released amount cannot exceed funded amount.")]
    ReleaseExceedsFunding,
    #[msg("USDC mint account does not match escrow state.")]
    InvalidMint,
    #[msg("Vault token account does not match escrow state.")]
    InvalidVault,
    #[msg("Worker account does not match escrow state.")]
    InvalidWorker,
    #[msg("Action is not allowed for the current escrow status.")]
    InvalidStatus,
    #[msg("Signer is not authorized for this escrow.")]
    Unauthorized,
    #[msg("Dispute reason is required.")]
    EmptyDisputeReason,
    #[msg("Dispute reason is too long.")]
    DisputeReasonTooLong,
}
