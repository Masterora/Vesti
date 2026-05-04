import { db } from "../lib/db";
import { createContract } from "../lib/services/contracts/create-contract";
import { fundContract } from "../lib/services/contracts/fund-contract";

const creatorWallet = "creator_demo_wallet_8pQ7n2";
const workerWallet = "worker_demo_wallet_5kL9s1";

async function main() {
  const existing = await db.contract.findFirst({
    where: {
      creatorWallet,
      workerWallet,
      title: "Seeded Vesti escrow demo"
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  if (existing) {
    console.log(`Demo contract already exists: ${existing.id}`);
    return;
  }

  const contract = await createContract({
    creatorWallet,
    workerWallet,
    title: "Seeded Vesti escrow demo",
    description:
      "Demo contract for validating the off-chain USDC milestone escrow flow with mock funding.",
    totalAmount: "1000",
    milestones: [
      {
        title: "Scope confirmation",
        description: "Confirm deliverables, milestones, and proof format.",
        amount: "250"
      },
      {
        title: "MVP implementation",
        description: "Deliver the working escrow MVP and basic documentation.",
        amount: "500"
      },
      {
        title: "Demo handoff",
        description: "Prepare final proof and walkthrough notes.",
        amount: "250"
      }
    ]
  });

  const funded = await fundContract({
    contractId: contract.id,
    walletAddress: creatorWallet
  });

  console.log(`Seeded active demo contract: ${funded.id}`);
  console.log("Creator wallet:", creatorWallet);
  console.log("Worker wallet:", workerWallet);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
