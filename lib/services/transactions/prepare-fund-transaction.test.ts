import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  mode: vi.fn(() => "onchain"),
}));
vi.mock("./chain-operations", () => ({ prepareChainOperation: mocks.prepare }));
vi.mock("@/lib/blockchain/escrow-adapter", () => ({
  getEscrowAdapterMode: mocks.mode,
}));
import { prepareFundTransaction } from "./prepare-fund-transaction";
describe("fund protocol selection", () => {
  it("uses the shared durable protocol for chain operations", async () => {
    const input = {
      contractId: "contract",
      walletAddress: "wallet",
      idempotencyKey: "key",
    };
    mocks.prepare.mockResolvedValue({ status: "signed", transaction: null });
    expect(await prepareFundTransaction(input)).toEqual({
      status: "signed",
      transaction: null,
    });
    expect(mocks.prepare).toHaveBeenCalledWith({ ...input, kind: "fund" });
  });
});
