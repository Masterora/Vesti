import { createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { ServiceError } from "@/lib/services/errors";

export const walletSessionCookieName = "vesti_session";

const authMessagePrefix = "Vesti wallet authentication";
const sessionTtlMs = 1000 * 60 * 60 * 24 * 7;
const challengeTtlMs = 1000 * 60 * 5;
const ed25519SpkiPrefix = Buffer.from("302a300506032b6570032100", "hex");

export type WalletSession = {
  walletAddress: string;
  expiresAt: string;
};

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url");
}

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new ServiceError("AUTH_SECRET is required for wallet sessions", 500);
  }

  return "vesti-local-development-auth-secret";
}

function signPayload(payload: string) {
  return createHmac("sha256", getAuthSecret()).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(request: Request) {
  const header = request.headers.get("cookie") ?? "";
  const cookies = new Map<string, string>();

  for (const item of header.split(";")) {
    const [rawName, ...rawValue] = item.trim().split("=");

    if (!rawName || rawValue.length === 0) {
      continue;
    }

    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }

  return cookies;
}

function getSessionCookieValue(request: Request) {
  return parseCookies(request).get(walletSessionCookieName);
}

export function createAuthNonce() {
  return randomBytes(24).toString("base64url");
}

export function createAuthMessage(input: { walletAddress: string; nonce: string }) {
  return [
    authMessagePrefix,
    "",
    `Wallet: ${input.walletAddress}`,
    `Nonce: ${input.nonce}`,
    "",
    "Sign this message to authenticate with Vesti."
  ].join("\n");
}

export function getChallengeExpiresAt(now = new Date()) {
  return new Date(now.getTime() + challengeTtlMs);
}

export function createWalletSession(walletAddress: string, now = new Date()): WalletSession {
  return {
    walletAddress,
    expiresAt: new Date(now.getTime() + sessionTtlMs).toISOString()
  };
}

export function encodeWalletSession(session: WalletSession) {
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function decodeWalletSession(value: string | undefined, now = new Date()) {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");

  if (!payload || !signature || !safeEqual(signPayload(payload), signature)) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload).toString("utf8")) as WalletSession;

    if (!session.walletAddress || !session.expiresAt || new Date(session.expiresAt) <= now) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

export function getWalletSession(request: Request) {
  return decodeWalletSession(getSessionCookieValue(request));
}

export function createWalletSessionCookie(walletAddress: string, now = new Date()) {
  const session = createWalletSession(walletAddress, now);
  const maxAge = Math.floor((new Date(session.expiresAt).getTime() - now.getTime()) / 1000);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  return {
    session,
    value: [
      `${walletSessionCookieName}=${encodeURIComponent(encodeWalletSession(session))}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${maxAge}`,
      secure
    ]
      .filter(Boolean)
      .join("; ")
  };
}

export function isDemoWalletAuthFallbackEnabled() {
  return process.env.DEMO_WALLET_AUTH_ENABLED !== "false";
}

export function resolveRequestWallet(request: Request, fallbackWalletAddress?: string | null) {
  const session = getWalletSession(request);

  if (session) {
    return session.walletAddress;
  }

  if (isDemoWalletAuthFallbackEnabled() && fallbackWalletAddress?.trim()) {
    return fallbackWalletAddress.trim();
  }

  throw new ServiceError("Wallet session is required", 401);
}

function publicKeyToEd25519Key(walletAddress: string) {
  const publicKey = new PublicKey(walletAddress);
  const rawPublicKey = Buffer.from(publicKey.toBytes());

  return createPublicKey({
    key: Buffer.concat([ed25519SpkiPrefix, rawPublicKey]),
    format: "der",
    type: "spki"
  });
}

export function verifySolanaMessageSignature(input: {
  walletAddress: string;
  message: string;
  signature: string;
}) {
  try {
    return verifySignature(
      null,
      Buffer.from(input.message, "utf8"),
      publicKeyToEd25519Key(input.walletAddress),
      Buffer.from(bs58.decode(input.signature))
    );
  } catch {
    return false;
  }
}
