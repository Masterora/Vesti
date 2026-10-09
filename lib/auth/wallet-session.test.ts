import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import bs58 from "bs58";
import {
  createAuthMessage,
  getWalletSession,
  createClearWalletSessionCookie,
  createWalletSessionCookie,
  decodeWalletSession,
  encodeWalletSession,
  resolveOptionalRequestWallet,
  resolveRequestWallet,
  verifySolanaMessageSignature,
  type WalletSession
} from "./wallet-session";

function createSignedMessage() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
  const walletAddress = bs58.encode(Buffer.from(publicKeyDer).subarray(-32));
  const message = createAuthMessage({
    walletAddress,
    nonce: "test-nonce-123456789"
  });
  const signature = bs58.encode(sign(null, Buffer.from(message, "utf8"), privateKey));

  return {
    walletAddress,
    message,
    signature
  };
}

describe("wallet sessions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies Solana ed25519 message signatures", () => {
    const signed = createSignedMessage();

    expect(verifySolanaMessageSignature(signed)).toBe(true);
    expect(
      verifySolanaMessageSignature({
        ...signed,
        message: `${signed.message}\nchanged`
      })
    ).toBe(false);
  });

  it("encodes and decodes signed session cookies", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret");

    const session: WalletSession = {
      walletAddress: "wallet_1234",
      expiresAt: new Date("2030-01-01T00:00:00.000Z").toISOString()
    };
    const encoded = encodeWalletSession(session);

    expect(decodeWalletSession(encoded, new Date("2029-01-01T00:00:00.000Z"))).toEqual(session);
    expect(decodeWalletSession(`${encoded}tampered`, new Date("2029-01-01T00:00:00.000Z"))).toBeNull();
    expect(decodeWalletSession(encoded, new Date("2031-01-01T00:00:00.000Z"))).toBeNull();
  });

  it("uses the authenticated session instead of the body wallet", () => {
    vi.stubEnv("AUTH_SECRET", "test-secret");
    const cookie = createWalletSessionCookie("session_wallet", new Date("2029-01-01T00:00:00.000Z"));
    const request = new Request("http://localhost/api/contracts/list", {
      headers: {
        cookie: cookie.value
      }
    });

    expect(resolveRequestWallet(request, "body_wallet")).toBe("session_wallet");
  });

  it("rejects body wallets without an authenticated session", () => {
    const request = new Request("http://localhost/api/contracts/list");
    expect(resolveOptionalRequestWallet(request, "body_wallet")).toBeNull();
    expect(() => resolveRequestWallet(request, "body_wallet")).toThrow("Wallet session is required");
  });

  it("rejects body wallets in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = new Request("http://localhost/api/contracts/list");
    expect(resolveOptionalRequestWallet(request, "body_wallet")).toBeNull();
  });
});

describe("environment cookie isolation", () => {
  it("reads and clears only its own deployment cookie in shared browser storage", () => {
    const previous = process.env.AUTH_SESSION_COOKIE_NAME;
    try {
      process.env.AUTH_SESSION_COOKIE_NAME = "vesti_local_session";
      const local = createWalletSessionCookie("local-wallet").value.split(";")[0];
      process.env.AUTH_SESSION_COOKIE_NAME = "vesti_devnet_session";
      const devnet = createWalletSessionCookie("devnet-wallet").value.split(";")[0];
      const request = new Request("http://localhost", { headers: { cookie: `${local}; ${devnet}` } });
      expect(getWalletSession(request)?.walletAddress).toBe("devnet-wallet");
      expect(createClearWalletSessionCookie()).toContain("vesti_devnet_session=");
      expect(createClearWalletSessionCookie()).not.toContain("Domain=");
      process.env.AUTH_SESSION_COOKIE_NAME = "vesti_local_session";
      expect(getWalletSession(request)?.walletAddress).toBe("local-wallet");
    } finally {
      if (previous === undefined) delete process.env.AUTH_SESSION_COOKIE_NAME;
      else process.env.AUTH_SESSION_COOKIE_NAME = previous;
    }
  });
});
