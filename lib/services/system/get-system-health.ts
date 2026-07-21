import { db } from "@/lib/db";
import { getEscrowAdapterMode } from "@/lib/blockchain/escrow-adapter";
import { ServiceError } from "@/lib/services/errors";

export async function getSystemHealth() {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    throw new ServiceError("Database is unavailable", 503);
  }

  return {
    status: "ok" as const,
    service: "vesti",
    database: "reachable" as const,
    escrowMode: getEscrowAdapterMode(),
    network: process.env.NEXT_PUBLIC_SOLANA_NETWORK?.trim() || "unknown",
    timestamp: new Date().toISOString()
  };
}
