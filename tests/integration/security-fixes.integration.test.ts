import { randomUUID, generateKeyPairSync, sign } from "node:crypto";
import bs58 from "bs58";
import sharp from "sharp";
import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { POST as challengeRoute } from "@/app/api/auth/challenge/route";
import { POST as verifyRoute } from "@/app/api/auth/verify/route";
import { GET as avatarRoute } from "@/app/api/profile/avatar/route";
import { updateSessionUserProfile } from "@/lib/services/profile/user-profiles";
import { createContract } from "@/lib/services/contracts/create-contract";
import { fundContract } from "@/lib/services/contracts/fund-contract";
import { disputeMilestone } from "@/lib/services/milestones/dispute-milestone";
import { proposeDisputeResolution } from "@/lib/services/milestones/propose-dispute-resolution";
import { acceptDisputeResolution } from "@/lib/services/milestones/accept-dispute-resolution";

describe("security fix boundary regressions", () => {
  it("never serves historical SVG or spoofed images; ordinary profile uploads remain usable", async () => {
    const walletAddress = `avatar_${randomUUID()}`;
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64");
    for (const mime of ["image/svg+xml", "image/png"]) {
      await db.user.upsert({ where: { walletAddress }, create: { walletAddress, avatarImage: `data:${mime};base64,${svg}` }, update: { avatarImage: `data:${mime};base64,${svg}` } });
      expect((await avatarRoute(new Request(`http://localhost/api/profile/avatar?wallet=${walletAddress}`))).status).toBe(404);
      await expect(updateSessionUserProfile({ walletAddress, avatarImage: `data:${mime};base64,${svg}` })).rejects.toThrow();
    }
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "blue" } }).png().toBuffer();
    await updateSessionUserProfile({ walletAddress, avatarImage: `data:image/png;base64,${png.toString("base64")}` });
    const response = await avatarRoute(new Request(`http://localhost/api/profile/avatar?wallet=${walletAddress}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect((await sharp(Buffer.from(await response.arrayBuffer())).metadata()).format).toBe("png");
  });
  it("victim wallet challenge/invalid-proof spam does not block the victim's own login", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const walletAddress = bs58.encode(Buffer.from(publicKey.export({ format: "der", type: "spki" })).subarray(-32));
    const request = (path: string, client: string, body: object) => new Request(`http://localhost/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json", "x-real-ip": client }, body: JSON.stringify(body) });
    const attacker = randomUUID(), victim = randomUUID();
    for (let i = 0; i < 6; i++) await challengeRoute(request("challenge", attacker, { walletAddress }));
    for (let i = 0; i < 11; i++) await verifyRoute(request("verify", attacker, { walletAddress, nonce: randomUUID(), signature: bs58.encode(Buffer.alloc(64)) }));
    const response = await challengeRoute(request("challenge", victim, { walletAddress }));
    expect(response.status).toBe(200);
    const { data } = await response.json();
    const signature = bs58.encode(sign(null, Buffer.from(data.message), privateKey));
    const login = await verifyRoute(request("verify", victim, { walletAddress, nonce: data.nonce, signature }));
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("vesti_session=");
  });
  it("rejects consent captured before an actual Mock proposal replacement", async () => {
    const creatorWallet = `creator_${randomUUID()}`, workerWallet = `worker_${randomUUID()}`;
    const c = await createContract({ creatorWallet, workerWallet, title: "Replacement", totalAmount: "10", milestones: [{ title: "Delivery", amount: "10" }] });
    const milestoneId = c.milestones[0].id;
    await fundContract({ contractId: c.id, walletAddress: creatorWallet });
    await disputeMilestone({ contractId: c.id, milestoneId, walletAddress: workerWallet, reason: "Review" });
    const context = { contractId: c.id, milestoneId, walletAddress: creatorWallet };
    await proposeDisputeResolution({ ...context, outcome: "release_to_worker", expectedProposalVersion: "0" });
    await proposeDisputeResolution({ ...context, outcome: "refund_to_creator", expectedProposalVersion: "1" });
    const oldConsent = { contractId: c.id, milestoneId, walletAddress: workerWallet, idempotencyKey: randomUUID(), expectedProposalVersion: "1", expectedOutcome: "release_to_worker" as const };
    await expect(acceptDisputeResolution(oldConsent)).rejects.toThrow("Proposal changed");
    await expect(acceptDisputeResolution({ ...oldConsent, expectedProposalVersion: "2" })).rejects.toThrow("Proposal changed");
    expect(await db.escrowTransaction.count({ where: { idempotencyKey: oldConsent.idempotencyKey } })).toBe(0);
    expect((await db.contract.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("disputed");
  });
  it.each(["release_to_worker", "refund_to_creator"] as const)("binds Mock consent and retry to the same %s proposal", async (outcome) => {
    const creatorWallet = `creator_${randomUUID()}`, workerWallet = `worker_${randomUUID()}`;
    const c = await createContract({ creatorWallet, workerWallet, title: "Consent", totalAmount: "10", milestones: [{ title: "Delivery", amount: "10" }] });
    const milestoneId = c.milestones[0].id;
    await fundContract({ contractId: c.id, walletAddress: creatorWallet });
    await disputeMilestone({ contractId: c.id, milestoneId, walletAddress: workerWallet, reason: "Review" });
    const proposal = { contractId: c.id, milestoneId, walletAddress: creatorWallet, outcome, expectedProposalVersion: "0" };
    await proposeDisputeResolution(proposal);
    await expect(proposeDisputeResolution(proposal)).rejects.toThrow("Proposal version changed");
    const accept = { contractId: c.id, milestoneId, walletAddress: workerWallet, idempotencyKey: randomUUID(), expectedProposalVersion: "1", expectedOutcome: outcome };
    await expect(acceptDisputeResolution({ ...accept, expectedProposalVersion: "0" })).rejects.toThrow("Proposal changed");
    const result = await acceptDisputeResolution(accept);
    expect((await acceptDisputeResolution(accept)).status).toBe(result.status);
    expect(await db.escrowTransaction.count({ where: { idempotencyKey: accept.idempotencyKey } })).toBe(1);
    await expect(acceptDisputeResolution({ ...accept, expectedOutcome: outcome === "release_to_worker" ? "refund_to_creator" : "release_to_worker" })).rejects.toThrow();
  });
});
