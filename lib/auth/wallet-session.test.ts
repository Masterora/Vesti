import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, afterEach } from "vitest";
import bs58 from "bs58";
import {
  createAuthMessage,
  createWalletSessionCookie,
  decodeWalletSession,
  encodeWalletSession,
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
  const originalAuthSecret = process.env.AUTH_SECRET;
  const originalDemoFallback = process.env.DEMO_WALLET_AUTH_ENABLED;

  afterEach(() => {
    process.env.AUTH_SECRET = originalAuthSecret;
    process.env.DEMO_WALLET_AUTH_ENABLED = originalDemoFallback;
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
    process.env.AUTH_SECRET = "test-secret";

    const session: WalletSession = {
      walletAddress: "wallet_1234",
      expiresAt: new Date("2030-01-01T00:00:00.000Z").toISOString()
    };
    const encoded = encodeWalletSession(session);

    expect(decodeWalletSession(encoded, new Date("2029-01-01T00:00:00.000Z"))).toEqual(session);
    expect(decodeWalletSession(`${encoded}tampered`, new Date("2029-01-01T00:00:00.000Z"))).toBeNull();
    expect(decodeWalletSession(encoded, new Date("2031-01-01T00:00:00.000Z"))).toBeNull();
  });

  it("resolves request wallets from session before demo fallback", () => {
    process.env.AUTH_SECRET = "test-secret";
    const cookie = createWalletSessionCookie("session_wallet", new Date("2029-01-01T00:00:00.000Z"));
    const request = new Request("http://localhost/api/contracts/list", {
      headers: {
        cookie: cookie.value
      }
    });

    expect(resolveRequestWallet(request, "body_wallet")).toBe("session_wallet");
  });

  it("can disable the demo wallet fallback", () => {
    process.env.DEMO_WALLET_AUTH_ENABLED = "false";
    const request = new Request("http://localhost/api/contracts/list");

    expect(() => resolveRequestWallet(request, "body_wallet")).toThrow("Wallet session is required");
  });
});
