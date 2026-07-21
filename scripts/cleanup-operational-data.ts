import "dotenv/config";
import { db } from "@/lib/db";

const challengeRetentionMs = 24 * 60 * 60_000;

async function main() {
  const now = new Date();
  const challengeCutoff = new Date(now.getTime() - challengeRetentionMs);
  const [rateLimitBuckets, authChallenges] = await db.$transaction([
    db.apiRateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }),
    db.walletAuthChallenge.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: challengeCutoff } },
          { consumedAt: { lt: challengeCutoff } }
        ]
      }
    })
  ]);

  console.log(
    `Removed ${rateLimitBuckets.count} rate-limit bucket(s) and ${authChallenges.count} authentication challenge(s).`
  );
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
