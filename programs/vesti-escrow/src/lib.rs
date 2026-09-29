use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

declare_id!("ErFsmiKY7WxjD9ArYmpqjCCUKnTcfzLm6tFpmWdFU9ck");

pub const STATUS_INITIALIZED: u8 = 0;
pub const STATUS_FUNDED: u8 = 1;
pub const STATUS_DISPUTED: u8 = 2;
pub const STATUS_COMPLETED: u8 = 3;
pub const STATUS_CANCELLED: u8 = 4;
pub const DISPUTE_OPEN: u8 = 0;
pub const DISPUTE_PROPOSED: u8 = 1;
pub const DISPUTE_RESOLVED: u8 = 2;
pub const OUTCOME_NONE: u8 = 0;
pub const OUTCOME_RELEASE: u8 = 1;
pub const OUTCOME_REFUND: u8 = 2;
pub const POLICY_ARBITRATOR: u8 = 1;

#[program]
pub mod vesti_escrow {
    use super::*;

    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        contract_id: String,
        worker: Pubkey,
        total_amount: u64,
    ) -> Result<()> {
        let escrow_key = ctx.accounts.escrow.key();
        initialize_state(
            &mut ctx.accounts.escrow,
            escrow_key,
            contract_id,
            ctx.accounts.creator.key(),
            worker,
            ctx.accounts.usdc_mint.key(),
            ctx.accounts.vault.key(),
            total_amount,
            ctx.bumps.escrow,
            ctx.bumps.vault,
        )
    }

    pub fn initialize_escrow_with_arbitrator(
        ctx: Context<InitializeEscrowWithArbitrator>,
        contract_id: String,
        worker: Pubkey,
        total_amount: u64,
        arbitrator: Pubkey,
    ) -> Result<()> {
        let creator = ctx.accounts.creator.key();
        let escrow_key = ctx.accounts.escrow.key();
        require!(
            arbitrator != Pubkey::default() && arbitrator != creator && arbitrator != worker,
            VestiEscrowError::InvalidArbitrator
        );
        initialize_state(
            &mut ctx.accounts.escrow,
            escrow_key,
            contract_id,
            creator,
            worker,
            ctx.accounts.usdc_mint.key(),
            ctx.accounts.vault.key(),
            total_amount,
            ctx.bumps.escrow,
            ctx.bumps.vault,
        )?;
        let policy = &mut ctx.accounts.policy;
        policy.escrow = ctx.accounts.escrow.key();
        policy.arbitrator = arbitrator;
        policy.mode = POLICY_ARBITRATOR;
        policy.bump = ctx.bumps.policy;
        emit!(DisputePolicySelected {
            escrow: policy.escrow,
            mode: policy.mode,
            arbitrator,
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

        token::transfer_checked(
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
        milestone_hash: [u8; 32],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;

        require!(!milestone_id.is_empty(), VestiEscrowError::EmptyMilestoneId);
        require!(
            milestone_id.len() <= EscrowState::MAX_MILESTONE_ID_LEN,
            VestiEscrowError::MilestoneIdTooLong
        );
        require!(amount > 0, VestiEscrowError::InvalidAmount);
        require!(
            milestone_hash == solana_sha256_hasher::hash(milestone_id.as_bytes()).to_bytes(),
            VestiEscrowError::InvalidMilestoneHash
        );
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

        token::transfer_checked(
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
        let receipt = &mut ctx.accounts.release_receipt;
        receipt.escrow = escrow.key();
        receipt.milestone_hash = milestone_hash;
        receipt.amount = amount;

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
        ctx: Context<OpenDispute>,
        milestone_id: String,
        milestone_hash: [u8; 32],
        reason_hash: [u8; 32],
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let actor = ctx.accounts.actor.key();
        require_participant(escrow, actor)?;
        require!(!milestone_id.is_empty(), VestiEscrowError::EmptyMilestoneId);
        require!(
            milestone_id.len() <= EscrowState::MAX_MILESTONE_ID_LEN,
            VestiEscrowError::MilestoneIdTooLong
        );
        require!(
            milestone_hash == solana_sha256_hasher::hash(milestone_id.as_bytes()).to_bytes(),
            VestiEscrowError::InvalidMilestoneHash
        );
        require!(
            escrow.status == STATUS_FUNDED,
            VestiEscrowError::InvalidStatus
        );
        require!(
            escrow.funded_amount > escrow.released_amount,
            VestiEscrowError::InvalidAmount
        );
        require!(
            ctx.accounts.release_receipt.data_is_empty(),
            VestiEscrowError::MilestoneAlreadyReleased
        );

        let dispute = &mut ctx.accounts.dispute;
        dispute.escrow = escrow.key();
        dispute.milestone_hash = milestone_hash;
        dispute.reason_hash = reason_hash;
        dispute.opened_by = actor;
        dispute.state = DISPUTE_OPEN;
        dispute.proposed_by = Pubkey::default();
        dispute.outcome = OUTCOME_NONE;
        dispute.proposed_amount = 0;
        dispute.proposal_version = 0;
        dispute.settled_amount = 0;
        dispute.resolved_by = Pubkey::default();
        dispute.bump = ctx.bumps.dispute;

        escrow.status = STATUS_DISPUTED;

        emit!(DisputeOpened {
            escrow: escrow.key(),
            milestone_hash,
            actor,
            reason_hash,
        });

        Ok(())
    }

    pub fn propose_resolution(
        ctx: Context<ProposeResolution>,
        outcome: u8,
        amount: u64,
        expected_current_version: u64,
    ) -> Result<()> {
        let escrow = &ctx.accounts.escrow;
        let actor = ctx.accounts.actor.key();
        require_participant(escrow, actor)?;
        require!(
            escrow.status == STATUS_DISPUTED,
            VestiEscrowError::InvalidStatus
        );
        let dispute = &mut ctx.accounts.dispute;
        require!(
            dispute.state != DISPUTE_RESOLVED,
            VestiEscrowError::InvalidStatus
        );
        require!(
            dispute.proposal_version == expected_current_version,
            VestiEscrowError::StaleProposal
        );
        let remaining = escrow
            .funded_amount
            .checked_sub(escrow.released_amount)
            .ok_or(VestiEscrowError::AmountOverflow)?;
        match outcome {
            OUTCOME_RELEASE => require!(
                amount > 0 && amount <= remaining,
                VestiEscrowError::InvalidAmount
            ),
            OUTCOME_REFUND => require!(
                amount == 0 && remaining > 0,
                VestiEscrowError::InvalidAmount
            ),
            _ => return err!(VestiEscrowError::InvalidOutcome),
        }
        dispute.proposal_version = dispute
            .proposal_version
            .checked_add(1)
            .ok_or(VestiEscrowError::AmountOverflow)?;
        dispute.proposed_by = actor;
        dispute.outcome = outcome;
        dispute.proposed_amount = amount;
        dispute.state = DISPUTE_PROPOSED;
        emit!(ResolutionProposed {
            escrow: escrow.key(),
            milestone_hash: dispute.milestone_hash,
            proposed_by: actor,
            outcome,
            amount,
            version: dispute.proposal_version,
        });
        Ok(())
    }

    pub fn accept_release_resolution(
        ctx: Context<AcceptReleaseResolution>,
        expected_proposal_version: u64,
        expected_amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let dispute = &mut ctx.accounts.dispute;
        validate_acceptance(
            escrow,
            dispute,
            ctx.accounts.acceptor.key(),
            OUTCOME_RELEASE,
            expected_proposal_version,
        )?;
        require!(
            expected_amount > 0 && expected_amount == dispute.proposed_amount,
            VestiEscrowError::InvalidAmount
        );
        let next_released = escrow
            .released_amount
            .checked_add(expected_amount)
            .ok_or(VestiEscrowError::AmountOverflow)?;
        require!(
            next_released <= escrow.funded_amount,
            VestiEscrowError::ReleaseExceedsFunding
        );
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"escrow", escrow.contract_id.as_bytes(), &[escrow.bump]]];
        token::transfer_checked(
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
            expected_amount,
            ctx.accounts.usdc_mint.decimals,
        )?;
        escrow.released_amount = next_released;
        escrow.status = if next_released == escrow.funded_amount {
            STATUS_COMPLETED
        } else {
            STATUS_FUNDED
        };
        let receipt = &mut ctx.accounts.release_receipt;
        receipt.escrow = escrow.key();
        receipt.milestone_hash = dispute.milestone_hash;
        receipt.amount = expected_amount;
        dispute.state = DISPUTE_RESOLVED;
        dispute.settled_amount = expected_amount;
        dispute.resolved_by = ctx.accounts.acceptor.key();
        emit!(DisputeResolved {
            escrow: escrow.key(),
            milestone_hash: dispute.milestone_hash,
            accepted_by: dispute.resolved_by,
            outcome: OUTCOME_RELEASE,
            settled_amount: expected_amount,
            released_amount: next_released,
            refunded_amount: 0,
            status: escrow.status,
            version: dispute.proposal_version,
        });
        Ok(())
    }

    pub fn accept_refund_resolution(
        ctx: Context<AcceptRefundResolution>,
        expected_proposal_version: u64,
        expected_refund_amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let dispute = &mut ctx.accounts.dispute;
        validate_acceptance(
            escrow,
            dispute,
            ctx.accounts.acceptor.key(),
            OUTCOME_REFUND,
            expected_proposal_version,
        )?;
        require!(
            dispute.proposed_amount == 0,
            VestiEscrowError::InvalidAmount
        );
        let remaining = escrow
            .funded_amount
            .checked_sub(escrow.released_amount)
            .ok_or(VestiEscrowError::AmountOverflow)?;
        require!(
            remaining > 0 && expected_refund_amount == remaining,
            VestiEscrowError::InvalidAmount
        );
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"escrow", escrow.contract_id.as_bytes(), &[escrow.bump]]];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.creator_token_account.to_account_info(),
                    authority: escrow.to_account_info(),
                },
                signer_seeds,
            ),
            remaining,
            ctx.accounts.usdc_mint.decimals,
        )?;
        escrow.status = STATUS_CANCELLED;
        dispute.state = DISPUTE_RESOLVED;
        dispute.settled_amount = remaining;
        dispute.resolved_by = ctx.accounts.acceptor.key();
        emit!(DisputeResolved {
            escrow: escrow.key(),
            milestone_hash: dispute.milestone_hash,
            accepted_by: dispute.resolved_by,
            outcome: OUTCOME_REFUND,
            settled_amount: remaining,
            released_amount: escrow.released_amount,
            refunded_amount: remaining,
            status: STATUS_CANCELLED,
            version: dispute.proposal_version,
        });
        Ok(())
    }

    pub fn arbitrate_release_resolution(
        ctx: Context<ArbitrateReleaseResolution>,
        amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let dispute = &mut ctx.accounts.dispute;
        validate_arbitration(
            escrow,
            dispute,
            &ctx.accounts.policy,
            ctx.accounts.arbitrator.key(),
        )?;
        require!(amount > 0, VestiEscrowError::InvalidAmount);
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
        token::transfer_checked(
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
        escrow.status = if next_released == escrow.funded_amount {
            STATUS_COMPLETED
        } else {
            STATUS_FUNDED
        };
        let receipt = &mut ctx.accounts.release_receipt;
        receipt.escrow = escrow.key();
        receipt.milestone_hash = dispute.milestone_hash;
        receipt.amount = amount;
        dispute.state = DISPUTE_RESOLVED;
        dispute.outcome = OUTCOME_RELEASE;
        dispute.proposed_amount = amount;
        dispute.settled_amount = amount;
        dispute.resolved_by = ctx.accounts.arbitrator.key();
        emit!(DisputeResolved {
            escrow: escrow.key(),
            milestone_hash: dispute.milestone_hash,
            accepted_by: dispute.resolved_by,
            outcome: OUTCOME_RELEASE,
            settled_amount: amount,
            released_amount: next_released,
            refunded_amount: 0,
            status: escrow.status,
            version: dispute.proposal_version,
        });
        Ok(())
    }

    pub fn arbitrate_refund_resolution(
        ctx: Context<ArbitrateRefundResolution>,
        expected_refund_amount: u64,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        let dispute = &mut ctx.accounts.dispute;
        validate_arbitration(
            escrow,
            dispute,
            &ctx.accounts.policy,
            ctx.accounts.arbitrator.key(),
        )?;
        let remaining = escrow
            .funded_amount
            .checked_sub(escrow.released_amount)
            .ok_or(VestiEscrowError::AmountOverflow)?;
        require!(
            remaining > 0 && expected_refund_amount == remaining,
            VestiEscrowError::InvalidAmount
        );
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"escrow", escrow.contract_id.as_bytes(), &[escrow.bump]]];
        token::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                TransferChecked {
                    from: ctx.accounts.vault.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.creator_token_account.to_account_info(),
                    authority: escrow.to_account_info(),
                },
                signer_seeds,
            ),
            remaining,
            ctx.accounts.usdc_mint.decimals,
        )?;
        escrow.status = STATUS_CANCELLED;
        dispute.state = DISPUTE_RESOLVED;
        dispute.outcome = OUTCOME_REFUND;
        dispute.proposed_amount = 0;
        dispute.settled_amount = remaining;
        dispute.resolved_by = ctx.accounts.arbitrator.key();
        emit!(DisputeResolved {
            escrow: escrow.key(),
            milestone_hash: dispute.milestone_hash,
            accepted_by: dispute.resolved_by,
            outcome: OUTCOME_REFUND,
            settled_amount: remaining,
            released_amount: escrow.released_amount,
            refunded_amount: remaining,
            status: STATUS_CANCELLED,
            version: dispute.proposal_version,
        });
        Ok(())
    }
}

fn initialize_state(
    escrow: &mut EscrowState,
    escrow_key: Pubkey,
    contract_id: String,
    creator: Pubkey,
    worker: Pubkey,
    usdc_mint: Pubkey,
    vault: Pubkey,
    total_amount: u64,
    bump: u8,
    vault_bump: u8,
) -> Result<()> {
    require!(!contract_id.is_empty(), VestiEscrowError::EmptyContractId);
    require!(
        contract_id.len() <= EscrowState::MAX_CONTRACT_ID_LEN,
        VestiEscrowError::ContractIdTooLong
    );
    require!(creator != worker, VestiEscrowError::InvalidParticipants);
    require!(total_amount > 0, VestiEscrowError::InvalidAmount);
    escrow.contract_id = contract_id;
    escrow.creator = creator;
    escrow.worker = worker;
    escrow.usdc_mint = usdc_mint;
    escrow.vault = vault;
    escrow.total_amount = total_amount;
    escrow.funded_amount = 0;
    escrow.released_amount = 0;
    escrow.status = STATUS_INITIALIZED;
    escrow.bump = bump;
    escrow.vault_bump = vault_bump;
    emit!(EscrowInitialized {
        contract_id: escrow.contract_id.clone(),
        escrow: escrow_key,
        vault,
        creator,
        worker,
        usdc_mint,
        total_amount,
    });
    Ok(())
}

fn require_participant(escrow: &EscrowState, actor: Pubkey) -> Result<()> {
    require!(
        actor == escrow.creator || actor == escrow.worker,
        VestiEscrowError::Unauthorized
    );
    Ok(())
}

fn validate_acceptance(
    escrow: &EscrowState,
    dispute: &DisputeState,
    actor: Pubkey,
    outcome: u8,
    expected_version: u64,
) -> Result<()> {
    require!(
        escrow.status == STATUS_DISPUTED,
        VestiEscrowError::InvalidStatus
    );
    require_participant(escrow, actor)?;
    require!(
        dispute.state == DISPUTE_PROPOSED && dispute.outcome == outcome,
        VestiEscrowError::InvalidOutcome
    );
    require!(
        dispute.proposed_by != actor,
        VestiEscrowError::SelfAcceptance
    );
    require!(
        dispute.proposal_version == expected_version,
        VestiEscrowError::StaleProposal
    );
    Ok(())
}

fn validate_arbitration(
    escrow: &EscrowState,
    dispute: &DisputeState,
    policy: &DisputePolicy,
    actor: Pubkey,
) -> Result<()> {
    require!(
        escrow.status == STATUS_DISPUTED,
        VestiEscrowError::InvalidStatus
    );
    require!(
        dispute.state != DISPUTE_RESOLVED,
        VestiEscrowError::InvalidStatus
    );
    require!(
        policy.mode == POLICY_ARBITRATOR && policy.arbitrator == actor,
        VestiEscrowError::Unauthorized
    );
    Ok(())
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
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        token::mint = usdc_mint,
        token::authority = escrow,
        token::token_program = token_program,
        seeds = [b"vault", contract_id.as_bytes()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(contract_id: String)]
pub struct InitializeEscrowWithArbitrator<'info> {
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
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        token::mint = usdc_mint,
        token::authority = escrow,
        token::token_program = token_program,
        seeds = [b"vault", contract_id.as_bytes()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = creator,
        space = 8 + DisputePolicy::INIT_SPACE,
        seeds = [b"policy", escrow.key().as_ref()],
        bump
    )]
    pub policy: Account<'info, DisputePolicy>,
    pub token_program: Program<'info, Token>,
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
    pub creator_token_account: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = escrow,
        token::token_program = token_program
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(milestone_id: String, amount: u64, milestone_hash: [u8; 32])]
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
    #[account(mut)]
    pub creator: Signer<'info>,
    /// CHECK: The worker wallet is constrained by `has_one = worker` and token ownership checks.
    pub worker: UncheckedAccount<'info>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = escrow,
        token::token_program = token_program
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = worker,
        token::token_program = token_program
    )]
    pub worker_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    #[account(
        init,
        payer = creator,
        space = 8 + MilestoneReleaseReceipt::INIT_SPACE,
        seeds = [
            b"release",
            escrow.key().as_ref(),
            milestone_hash.as_ref()
        ],
        bump
    )]
    pub release_receipt: Account<'info, MilestoneReleaseReceipt>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(milestone_id: String, milestone_hash: [u8; 32])]
pub struct OpenDispute<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.contract_id.as_bytes()],
        bump = escrow.bump
    )]
    pub escrow: Account<'info, EscrowState>,
    #[account(mut)]
    pub actor: Signer<'info>,
    #[account(
        init,
        payer = actor,
        space = 8 + DisputeState::INIT_SPACE,
        seeds = [b"dispute", escrow.key().as_ref(), milestone_hash.as_ref()],
        bump
    )]
    pub dispute: Account<'info, DisputeState>,
    /// CHECK: Only its PDA and absence are checked; this account is never read as data.
    #[account(
        seeds = [b"release", escrow.key().as_ref(), milestone_hash.as_ref()],
        bump
    )]
    pub release_receipt: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProposeResolution<'info> {
    #[account(seeds = [b"escrow", escrow.contract_id.as_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, EscrowState>,
    #[account(
        mut,
        seeds = [b"dispute", escrow.key().as_ref(), dispute.milestone_hash.as_ref()],
        bump = dispute.bump,
        has_one = escrow @ VestiEscrowError::InvalidDispute
    )]
    pub dispute: Account<'info, DisputeState>,
    pub actor: Signer<'info>,
}

#[derive(Accounts)]
pub struct AcceptReleaseResolution<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.contract_id.as_bytes()], bump = escrow.bump,
        has_one = worker @ VestiEscrowError::InvalidWorker,
        has_one = usdc_mint @ VestiEscrowError::InvalidMint,
        has_one = vault @ VestiEscrowError::InvalidVault
    )]
    pub escrow: Box<Account<'info, EscrowState>>,
    #[account(
        mut,
        seeds = [b"dispute", escrow.key().as_ref(), dispute.milestone_hash.as_ref()],
        bump = dispute.bump,
        has_one = escrow @ VestiEscrowError::InvalidDispute
    )]
    pub dispute: Box<Account<'info, DisputeState>>,
    #[account(mut)]
    pub acceptor: Signer<'info>,
    /// CHECK: Bound to escrow.worker; the destination token account checks its authority.
    pub worker: UncheckedAccount<'info>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = usdc_mint, token::authority = escrow)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = usdc_mint, token::authority = worker)]
    pub worker_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init,
        payer = acceptor,
        space = 8 + MilestoneReleaseReceipt::INIT_SPACE,
        seeds = [b"release", escrow.key().as_ref(), dispute.milestone_hash.as_ref()],
        bump
    )]
    pub release_receipt: Box<Account<'info, MilestoneReleaseReceipt>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptRefundResolution<'info> {
    #[account(
        mut,
        seeds = [b"escrow", escrow.contract_id.as_bytes()], bump = escrow.bump,
        has_one = creator @ VestiEscrowError::Unauthorized,
        has_one = usdc_mint @ VestiEscrowError::InvalidMint,
        has_one = vault @ VestiEscrowError::InvalidVault
    )]
    pub escrow: Account<'info, EscrowState>,
    #[account(
        mut,
        seeds = [b"dispute", escrow.key().as_ref(), dispute.milestone_hash.as_ref()],
        bump = dispute.bump,
        has_one = escrow @ VestiEscrowError::InvalidDispute
    )]
    pub dispute: Account<'info, DisputeState>,
    pub acceptor: Signer<'info>,
    /// CHECK: Bound to escrow.creator; the destination token account checks its authority.
    pub creator: UncheckedAccount<'info>,
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, token::mint = usdc_mint, token::authority = escrow)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = usdc_mint, token::authority = creator)]
    pub creator_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ArbitrateReleaseResolution<'info> {
    #[account(
        mut, seeds = [b"escrow", escrow.contract_id.as_bytes()], bump = escrow.bump,
        has_one = worker @ VestiEscrowError::InvalidWorker,
        has_one = usdc_mint @ VestiEscrowError::InvalidMint,
        has_one = vault @ VestiEscrowError::InvalidVault
    )]
    pub escrow: Box<Account<'info, EscrowState>>,
    #[account(
        mut, seeds = [b"dispute", escrow.key().as_ref(), dispute.milestone_hash.as_ref()],
        bump = dispute.bump, has_one = escrow @ VestiEscrowError::InvalidDispute
    )]
    pub dispute: Box<Account<'info, DisputeState>>,
    #[account(
        seeds = [b"policy", escrow.key().as_ref()], bump = policy.bump,
        has_one = escrow @ VestiEscrowError::InvalidDispute,
        has_one = arbitrator @ VestiEscrowError::InvalidArbitrator
    )]
    pub policy: Box<Account<'info, DisputePolicy>>,
    #[account(mut)]
    pub arbitrator: Signer<'info>,
    /// CHECK: Bound to escrow.worker; the destination token account checks its authority.
    pub worker: UncheckedAccount<'info>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = usdc_mint, token::authority = escrow)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = usdc_mint, token::authority = worker)]
    pub worker_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        init, payer = arbitrator, space = 8 + MilestoneReleaseReceipt::INIT_SPACE,
        seeds = [b"release", escrow.key().as_ref(), dispute.milestone_hash.as_ref()], bump
    )]
    pub release_receipt: Box<Account<'info, MilestoneReleaseReceipt>>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ArbitrateRefundResolution<'info> {
    #[account(
        mut, seeds = [b"escrow", escrow.contract_id.as_bytes()], bump = escrow.bump,
        has_one = creator @ VestiEscrowError::Unauthorized,
        has_one = usdc_mint @ VestiEscrowError::InvalidMint,
        has_one = vault @ VestiEscrowError::InvalidVault
    )]
    pub escrow: Box<Account<'info, EscrowState>>,
    #[account(
        mut, seeds = [b"dispute", escrow.key().as_ref(), dispute.milestone_hash.as_ref()],
        bump = dispute.bump, has_one = escrow @ VestiEscrowError::InvalidDispute
    )]
    pub dispute: Box<Account<'info, DisputeState>>,
    #[account(
        seeds = [b"policy", escrow.key().as_ref()], bump = policy.bump,
        has_one = escrow @ VestiEscrowError::InvalidDispute,
        has_one = arbitrator @ VestiEscrowError::InvalidArbitrator
    )]
    pub policy: Box<Account<'info, DisputePolicy>>,
    pub arbitrator: Signer<'info>,
    /// CHECK: Bound to escrow.creator; the destination token account checks its authority.
    pub creator: UncheckedAccount<'info>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(mut, token::mint = usdc_mint, token::authority = escrow)]
    pub vault: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = usdc_mint, token::authority = creator)]
    pub creator_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
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

#[account]
#[derive(InitSpace)]
pub struct MilestoneReleaseReceipt {
    pub escrow: Pubkey,
    pub milestone_hash: [u8; 32],
    pub amount: u64,
}

#[account]
#[derive(InitSpace)]
pub struct DisputeState {
    pub escrow: Pubkey,
    pub milestone_hash: [u8; 32],
    pub reason_hash: [u8; 32],
    pub opened_by: Pubkey,
    pub state: u8,
    pub proposed_by: Pubkey,
    pub outcome: u8,
    pub proposed_amount: u64,
    pub proposal_version: u64,
    pub settled_amount: u64,
    pub resolved_by: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DisputePolicy {
    pub escrow: Pubkey,
    pub arbitrator: Pubkey,
    pub mode: u8,
    pub bump: u8,
}

impl EscrowState {
    pub const MAX_CONTRACT_ID_LEN: usize = 32;
    pub const MAX_MILESTONE_ID_LEN: usize = 64;
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
pub struct DisputeOpened {
    pub escrow: Pubkey,
    pub milestone_hash: [u8; 32],
    pub actor: Pubkey,
    pub reason_hash: [u8; 32],
}

#[event]
pub struct ResolutionProposed {
    pub escrow: Pubkey,
    pub milestone_hash: [u8; 32],
    pub proposed_by: Pubkey,
    pub outcome: u8,
    pub amount: u64,
    pub version: u64,
}

#[event]
pub struct DisputeResolved {
    pub escrow: Pubkey,
    pub milestone_hash: [u8; 32],
    pub accepted_by: Pubkey,
    pub outcome: u8,
    pub settled_amount: u64,
    pub released_amount: u64,
    pub refunded_amount: u64,
    pub status: u8,
    pub version: u64,
}

#[event]
pub struct DisputePolicySelected {
    pub escrow: Pubkey,
    pub mode: u8,
    pub arbitrator: Pubkey,
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
    #[msg("Milestone hash does not match the milestone id.")]
    InvalidMilestoneHash,
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
    #[msg("The milestone has already been released.")]
    MilestoneAlreadyReleased,
    #[msg("Dispute account does not belong to the escrow.")]
    InvalidDispute,
    #[msg("Resolution outcome is invalid.")]
    InvalidOutcome,
    #[msg("The proposal version is stale.")]
    StaleProposal,
    #[msg("The proposing participant cannot accept their own proposal.")]
    SelfAcceptance,
    #[msg("Arbitrator wallet must differ from both participants.")]
    InvalidArbitrator,
}
