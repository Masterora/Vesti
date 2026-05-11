import { afterEach, describe, expect, it, vi } from "vitest";
import { getEscrowAdapterMode } from "./escrow-adapter";

describe("escrow adapter mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires an explicit mode when unset", () => {
    vi.stubEnv("ESCROW_ADAPTER_MODE", undefined);

    expect(() => getEscrowAdapterMode()).toThrow("ESCROW_ADAPTER_MODE is required");
  });

  it("accepts mock mode explicitly", () => {
    vi.stubEnv("ESCROW_ADAPTER_MODE", "mock");

    expect(getEscrowAdapterMode()).toBe("mock");
  });

  it("accepts explicit modes case-insensitively", () => {
    vi.stubEnv("ESCROW_ADAPTER_MODE", "ONCHAIN");

    expect(getEscrowAdapterMode()).toBe("onchain");
  });
});