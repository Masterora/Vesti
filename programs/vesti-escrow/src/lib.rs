use anchor_lang::prelude::*;

declare_id!("FPAahm7kTaMhtQWM2DjYnUFkWaYviMVitJFxyh1nAWFQ");

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
        creator: Pubkey,
        worker: Pubkey,
        total_amount: u64,
    ) -> Result<()> {
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
        escrow.total_amount = total_amount;
        escrow.funded_amount = 0;
        escrow.released_amount = 0;
        escrow.status = STATUS_INITIALIZED;
        escrow.bump = ctx.bumps.escrow;

        Ok(())
    }

    pub fn mark_funded(ctx: Context<CreatorEscrowAction>, amount: u64) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        require!(
            amount == escrow.total_amount,
            VestiEscrowError::InvalidAmount
        );
        require!(
            escrow.status == STATUS_INITIALIZED,
            VestiEscrowError::InvalidStatus
        );

        escrow.funded_amount = amount;
        escrow.status = STATUS_FUNDED;

        Ok(())
    }

    pub fn release_milestone(
        ctx: Context<CreatorEscrowAction>,
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

        escrow.released_amount = next_released;

        if escrow.released_amount == escrow.total_amount {
            escrow.status = STATUS_COMPLETED;
        }

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

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(contract_id: String)]
pub struct InitializeEscrow<'info> {
    #[account(
        init,
        payer = payer,
        space = 8 + EscrowState::INIT_SPACE,
        seeds = [b"escrow", contract_id.as_bytes()],
        bump
    )]
    pub escrow: Account<'info, EscrowState>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CreatorEscrowAction<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.contract_id.as_bytes()],
        bump = escrow.bump,
        has_one = creator @ VestiEscrowError::Unauthorized
    )]
    pub escrow: Account<'info, EscrowState>,
    pub creator: Signer<'info>,
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
    #[max_len(64)]
    pub contract_id: String,
    pub creator: Pubkey,
    pub worker: Pubkey,
    pub total_amount: u64,
    pub funded_amount: u64,
    pub released_amount: u64,
    pub status: u8,
    pub bump: u8,
}

impl EscrowState {
    pub const MAX_CONTRACT_ID_LEN: usize = 64;
    pub const MAX_MILESTONE_ID_LEN: usize = 64;
    pub const MAX_DISPUTE_REASON_LEN: usize = 256;
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
    #[msg("Action is not allowed for the current escrow status.")]
    InvalidStatus,
    #[msg("Signer is not authorized for this escrow.")]
    Unauthorized,
    #[msg("Dispute reason is required.")]
    EmptyDisputeReason,
    #[msg("Dispute reason is too long.")]
    DisputeReasonTooLong,
}
