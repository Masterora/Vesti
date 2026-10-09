import bs58 from "bs58";
import { readFileSync } from "node:fs";
import { PublicKey } from "@solana/web3.js";
import { chainConfig, chainIdentity, digest } from "./chain-protocol";
import { configuredRelease } from "./release-manifest";
import { assertState } from "@/lib/services/errors";
export async function verifyReleaseArtifact(artifactPath: string, idlPath: string) {
  const release = configuredRelease(), identity = await chainIdentity(), { connection, programId } = chainConfig();
  const manifest = release.manifest, artifact = readFileSync(artifactPath), idl = readFileSync(idlPath);
  assertState(digest(artifact) === manifest.artifact.sha256 && artifact.length === manifest.artifact.byteLength && digest(idl) === manifest.artifact.idlSha256, "Build artifact or IDL differs");
  const program = await connection.getAccountInfo(programId, "finalized");
  assertState(!!program?.executable && program.owner.toBase58() === manifest.programLoader, "Program executable or loader differs");
  let payload = program!.data;
  let deployedSlot = "0", authority: string | null = null;
  if (manifest.programLoader === "BPFLoaderUpgradeab1e11111111111111111111111") {
    assertState(payload.length === 36 && payload.readUInt32LE(0) === 2, "Unsupported Program layout");
    const dataAddress = new PublicKey(payload.subarray(4, 36));
    assertState(dataAddress.toBase58() === manifest.programDataAddress, "ProgramData address differs");
    const data = await connection.getAccountInfo(dataAddress, "finalized");
    assertState(!!data && data.owner.equals(program!.owner) && data.data.length >= 45 && data.data.readUInt32LE(0) === 3, "Unsupported ProgramData layout");
    deployedSlot = data!.data.readBigUInt64LE(4).toString();
    assertState([0, 1].includes(data!.data[12]), "Unsupported authority option");
    authority = data!.data[12] === 1 ? new PublicKey(data!.data.subarray(13, 45)).toBase58() : null;
    payload = data!.data.subarray(45);
    const deployment = await connection.getTransaction(manifest.deploymentTxSig, { commitment: "finalized", maxSupportedTransactionVersion: 0 });
    assertState(!!deployment?.meta && !deployment.meta.err && deployment.slot.toString() === deployedSlot, "Finalized deployment evidence differs");
    const message = deployment!.transaction.message;
    assertState("accountKeys" in message, "Versioned loader deployment proof is not supported");
    if (!("accountKeys" in message)) throw new Error("Unsupported loader message");
    const loader = new PublicKey(manifest.programLoader);
    const loaderCall = message.instructions.some((ix) => {
      const bytes = Buffer.from(bs58.decode(ix.data));
      return message.accountKeys[ix.programIdIndex].equals(loader) && bytes.length >= 4 && [2, 3].includes(bytes.readUInt32LE(0)) &&
        ix.accounts.some((n) => message.accountKeys[n].equals(programId)) && ix.accounts.some((n) => message.accountKeys[n].equals(dataAddress));
    });
    assertState(loaderCall, "Deployment signature does not contain the approved loader operation");
  } else assertState(manifest.cluster === "localnet" && manifest.programDataAddress === null, "Non-upgradeable loader is only supported in local tests");
  assertState(deployedSlot === manifest.deployedSlot && authority === manifest.upgradeAuthority, "Deployment slot or authority differs");
  assertState(payload.length === manifest.deployedProgram.payloadLength && digest(payload) === identity.programHash, "Deployed payload differs");
  assertState(payload.length >= artifact.length && payload.subarray(0, artifact.length).equals(artifact) && payload.subarray(artifact.length).every((byte) => byte === 0), "Deployed code is not the locked artifact with zero padding");
  return { status: "passed", releaseId: manifest.releaseId, manifestSha256: release.manifestSha256, artifactSha256: digest(artifact), payloadSha256: digest(payload), deployedSlot, authority };
}
