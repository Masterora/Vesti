import { db } from "@/lib/db";
import { ServiceError } from "@/lib/services/errors";

const dataUrlPattern = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/;

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const walletAddress = searchParams.get("wallet")?.trim();
  const hasVersion = Boolean(searchParams.get("v")?.trim());

  if (!walletAddress) {
    throw new ServiceError("Wallet address is required", 400);
  }

  const user = await db.user.findUnique({
    where: {
      walletAddress
    },
    select: {
      avatarImage: true
    }
  });

  if (!user?.avatarImage) {
    return new Response(null, { status: 404 });
  }

  const match = user.avatarImage.match(dataUrlPattern);

  if (!match) {
    throw new Error("Stored avatar image is invalid");
  }

  const [, contentType, base64Payload] = match;

  return new Response(Buffer.from(base64Payload.replace(/\s+/g, ""), "base64"), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": hasVersion
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300"
    }
  });
}