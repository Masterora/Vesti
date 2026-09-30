import "dotenv/config";
import { chainConfig, readProgramHash } from "@/lib/blockchain/chain-protocol";
async function main() {
  const { connection, programId } = chainConfig();
  console.log(
    JSON.stringify(
      {
        programId: programId.toBase58(),
        ESCROW_NETWORK_GENESIS_HASH: await connection.getGenesisHash(),
        ESCROW_PROGRAM_SHA256: await readProgramHash(connection, programId),
      },
      null,
      2,
    ),
  );
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Unable to inspect chain identity",
  );
  process.exitCode = 1;
});
