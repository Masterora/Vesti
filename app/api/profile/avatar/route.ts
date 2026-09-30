import { db } from "@/lib/db";
import { ServiceError } from "@/lib/services/errors";
import { normalizeAvatarImage } from "@/lib/profile/avatar-content";

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

  let bytes: Buffer;
  try {
    ({ bytes } = await normalizeAvatarImage(user.avatarImage));
  } catch {
    // Historical active/invalid uploads are never served as documents.
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": hasVersion
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300"
    }
  });
}
