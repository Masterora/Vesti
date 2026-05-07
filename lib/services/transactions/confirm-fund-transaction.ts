import { db } from "@/lib/db";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { confirmSolanaSignature } from "@/lib/blockchain/solana-confirmation";
import {
  deriveSolanaEscrowAccounts,
  parsePublicKey,
  TOKEN_PROGRAM_ID
} from "@/lib/blockchain/solana-escrow-accounts";
import { applyContractFunded } from "@/lib/services/contracts/apply-contract-funded";
import { assertAllowed, assertFound, assertState } from "@/lib/services/errors";
import { serializeContract } from "@/lib/services/serialize";
import type { ConfirmFundTransactionInput } from "@/lib/validations/transaction";

function deriveEscrowAccount(input: {
  contractId: string;
  creatorWallet: string;
  workerWallet: string;
}) {
  const programId = parsePublicKey(process.env.ESCROW_PROGRAM_ID ?? "", "ESCROW_PROGRAM_ID");
  const usdcMint = parsePublicKey(process.env.NEXT_PUBLIC_USDC_MINT ?? "", "NEXT_PUBLIC_USDC_MINT");
  const creator = parsePublicKey(input.creatorWallet, "creatorWallet");
  const worker = parsePublicKey(input.workerWallet, "workerWallet");

  return deriveSolanaEscrowAccounts({
    contractId: input.contractId,
    programId,
    usdcMint,
    creator,
    worker,
    tokenProgramId: TOKEN_PROGRAM_ID
  }).escrowPda.toBase58();
}

export async function confirmFundTransaction(input: ConfirmFundTransactionInput) {
  const mode = getEscrowAdapterMode();

  if (mode === "mock") {
    return {
      mode,
      action: "fund_contract" as const,
      contractId: input.contractId,
      confirmed: false,
      canUseDirectAction: true,
      message: "Mock escrow mode does not confirm wallet-signed transactions."
    };
  }

  const confirmation = await confirmSolanaSignature(input.txSig);

  return db.$transaction(async (tx) => {
    const contract = assertFound(
      await tx.contract.findUnique({
        where: { id: input.contractId },
        include: {
          milestones: {
            orderBy: { index: "asc" }
          }
        }
      }),
      "Contract not found"
    );

    assertAllowed(
      input.walletAddress === contract.creatorWallet,
      "Only the Creator can confirm funding"
    );
    assertState(contract.status === "draft", "Only draft contracts can be funded");

    await applyContractFunded(tx, {
      contract,
      actorWallet: input.walletAddress,
      escrowAccount: deriveEscrowAccount({
        contractId: contract.id,
        creatorWallet: contract.creatorWallet,
        workerWallet: contract.workerWallet
      }),
      txSig: input.txSig
    });

    const updated = await tx.contract.findUniqueOrThrow({
      where: { id: contract.id },
      include: {
        milestones: {
          orderBy: { index: "asc" },
          include: {
            proofSubmissions: {
              orderBy: { version: "desc" }
            }
          }
        },
        events: {
          orderBy: { createdAt: "desc" }
        }
      }
    });

    return {
      mode,
      action: "fund_contract" as const,
      confirmed: true,
      confirmation,
      contract: serializeContract(updated)
    };
  });
}
