import { describe, expect, it } from "vitest";
import {
  acceptContractClaimSchema,
  claimContractSchema,
  createContractSchema,
  listContractsSchema
} from "./contract";

describe("contract validation", () => {
  it("allows creating a public project without a preassigned worker", () => {
    expect(
      createContractSchema.parse({
        creatorWallet: "creator_wallet",
        title: "Open project",
        totalAmount: "100",
        milestones: [
          {
            title: "Milestone 1",
            amount: "100"
          }
        ]
      })
    ).toMatchObject({
      creatorWallet: "creator_wallet",
      title: "Open project"
    });
  });

  it("accepts contract list requests without a wallet filter", () => {
    expect(listContractsSchema.parse({})).toEqual({});
  });

  it("requires wallet addresses for claim and accept-claim actions", () => {
    expect(
      claimContractSchema.parse({
        contractId: "contract_123",
        walletAddress: "worker_wallet"
      })
    ).toMatchObject({
      contractId: "contract_123",
      walletAddress: "worker_wallet"
    });

    expect(
      acceptContractClaimSchema.parse({
        contractId: "contract_123",
        walletAddress: "creator_wallet"
      })
    ).toMatchObject({
      contractId: "contract_123",
      walletAddress: "creator_wallet"
    });

    expect(() =>
      claimContractSchema.parse({
        contractId: "contract_123",
        walletAddress: ""
      })
    ).toThrow("Wallet address is required");

    expect(() =>
      acceptContractClaimSchema.parse({
        contractId: "contract_123",
        walletAddress: ""
      })
    ).toThrow("Wallet address is required");
  });
});
