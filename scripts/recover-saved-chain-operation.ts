import { releaseArgs, cliMain } from "./release-cli";
import { recoverChainOperation } from "../lib/services/transactions/chain-operations";
cliMain(async () => {
  const args = releaseArgs(); if (!args.transaction) throw new Error("Transaction ID required");
  const operation = await recoverChainOperation(args.transaction);
  return { transactionId: operation.id, status: operation.status, txSig: operation.txSig };
});
