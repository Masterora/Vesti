import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";

describe("legacy durable protocol migration", () => {
  it("preserves signatures and mock rows while isolating ambiguous legacy pending operations", async () => {
    const previous = [
      "20260504170152_init",
      "20260720150000_escrow_transactions_and_disputes",
      "20260721010000_operational_hardening",
      "20260929090000_dispute_policy",
    ];
    const scripts = await Promise.all(
      [...previous, "20260930090000_web_chain_disputes"].map((name) =>
        readFile(`prisma/migrations/${name}/migration.sql`, "utf8"),
      ),
    );
    // All migration files contain plain DDL/DML. Execute each statement on one isolated connection.
    await db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('CREATE SCHEMA "vesti_legacy_upgrade_test"');
        await tx.$executeRawUnsafe(
          'SET LOCAL search_path TO "vesti_legacy_upgrade_test"',
        );
        const execute = async (sql: string) => {
          for (const statement of sql
            .replace(/--[^\n]*/g, "")
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean))
            await tx.$executeRawUnsafe(statement);
        };
        for (const sql of scripts.slice(0, -1)) await execute(sql);
        await tx.$executeRawUnsafe(
          `INSERT INTO "User" (id,"walletAddress","updatedAt") VALUES ('user','creator',CURRENT_TIMESTAMP)`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "Contract" (id,"displayId","creatorWallet",title,"totalAmount","updatedAt") VALUES ('a','A','creator','prepared',10,CURRENT_TIMESTAMP),('b','B','creator','submitted',10,CURRENT_TIMESTAMP),('c','C','creator','multiple',10,CURRENT_TIMESTAMP),('d','D','creator','mock',10,CURRENT_TIMESTAMP)`,
        );
        await tx.$executeRawUnsafe(`INSERT INTO "EscrowTransaction" (id,"contractId",action,mode,"walletAddress","idempotencyKey","operationKey","txSig",status,"updatedAt") VALUES
        ('a1','a','fund','onchain','creator','a1','fund:a',NULL,'prepared',CURRENT_TIMESTAMP),
        ('b1','b','fund','onchain','creator','b1','fund:b','signature-b','submitted',CURRENT_TIMESTAMP),
        ('c1','c','fund','onchain','creator','c1','fund:c','signature-c','submitted',CURRENT_TIMESTAMP),
        ('c2','c','release','onchain','creator','c2','release:c',NULL,'prepared',CURRENT_TIMESTAMP),
        ('d1','d','fund','mock','creator','d1','fund:d',NULL,'prepared',CURRENT_TIMESTAMP)`);
        await execute(scripts.at(-1)!);
        const rows = await tx.$queryRawUnsafe<
          {
            id: string;
            kind: string;
            txSig: string | null;
            contractLockKey: string | null;
            requiresReviewAt: Date | null;
            operationKey: string;
            logicalOperationKey: string;
          }[]
        >(
          'SELECT id,kind,"txSig","contractLockKey","requiresReviewAt","operationKey","logicalOperationKey" FROM "EscrowTransaction" ORDER BY id',
        );
        expect(rows).toHaveLength(5);
        expect(
          rows.find((r) => r.id === "a1")?.requiresReviewAt,
        ).not.toBeNull();
        expect(rows.find((r) => r.id === "b1")).toMatchObject({
          txSig: "signature-b",
          requiresReviewAt: null,
          contractLockKey: "b",
          kind: "fund",
        });
        expect(
          rows
            .filter((r) => r.id.startsWith("c"))
            .every((r) => r.requiresReviewAt),
        ).toBe(true);
        expect(
          rows.filter((r) => r.id.startsWith("c") && r.contractLockKey),
        ).toHaveLength(1);
        expect(rows.find((r) => r.id === "d1")).toMatchObject({
          contractLockKey: null,
          requiresReviewAt: null,
        });
        expect(
          rows.every((r) => r.logicalOperationKey === r.operationKey),
        ).toBe(true);
        await tx.$executeRawUnsafe(
          'DROP SCHEMA "vesti_legacy_upgrade_test" CASCADE',
        );
      },
      { timeout: 30000 },
    );
  });
});
