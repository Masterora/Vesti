import { describe, expect, it } from "vitest";
import {
  acceptContractClaimSchema,
  claimContractSchema,
  createContractCommentSchema,
  createContractSchema,
  deleteContractSchema,
  listContractsSchema,
  renameContractSchema
} from "./contract";

describe("contract validation", () => {
  it("allows creating a public project without a preassigned worker", () => {
    expect(
      createContractSchema.parse({
        creatorWallet: "creator_wallet",
        title: "Open project",
        tags: ["solana", "frontend"],
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

  it("accepts an optional title-or-tag search query", () => {
    expect(
      listContractsSchema.parse({
        query: "solana"
      })
    ).toEqual({
      query: "solana"
    });
  });

  it("accepts an optional status filter", () => {
    expect(
      listContractsSchema.parse({
        status: "active"
      })
    ).toEqual({
      status: "active"
    });
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
        walletAddress: "creator_wallet",
        applicantWallet: "worker_wallet"
      })
    ).toMatchObject({
      contractId: "contract_123",
      walletAddress: "creator_wallet",
      applicantWallet: "worker_wallet"
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
        walletAddress: "",
        applicantWallet: "worker_wallet"
      })
    ).toThrow("Wallet address is required");

    expect(() =>
      acceptContractClaimSchema.parse({
        contractId: "contract_123",
        walletAddress: "creator_wallet",
        applicantWallet: ""
      })
    ).toThrow("Wallet address is required");
  });

  it("validates delete and rename contract actions", () => {
    expect(
      deleteContractSchema.parse({
        contractId: "contract_123",
        walletAddress: "creator_wallet"
      })
    ).toMatchObject({
      contractId: "contract_123",
      walletAddress: "creator_wallet"
    });

    expect(
      renameContractSchema.parse({
        contractId: "contract_123",
        walletAddress: "creator_wallet",
        title: "Renamed contract"
      })
    ).toMatchObject({
      title: "Renamed contract"
    });

    expect(() =>
      renameContractSchema.parse({
        contractId: "contract_123",
        walletAddress: "creator_wallet",
        title: "   "
      })
    ).toThrow("Contract title is required");
  });

  it("validates contract discussion comments", () => {
    expect(
      createContractCommentSchema.parse({
        contractId: "contract_123",
        walletAddress: "worker_wallet",
        body: "Can you clarify the acceptance criteria for milestone 2?"
      })
    ).toMatchObject({
      contractId: "contract_123",
      walletAddress: "worker_wallet"
    });

    expect(() =>
      createContractCommentSchema.parse({
        contractId: "contract_123",
        walletAddress: "worker_wallet",
        body: "   "
      })
    ).toThrow("Comment is required");
  });
});
