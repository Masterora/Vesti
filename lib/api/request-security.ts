import { ServiceError } from "@/lib/services/errors";

export function getRequestClientIdentity(request: Request) {
  const candidate =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    "unknown";
  const normalized = candidate.trim().slice(0, 128);

  return normalized || "unknown";
}

export function assertTrustedRequestOrigin(request: Request) {
  const originHeader = request.headers.get("origin")?.trim();

  if (!originHeader) {
    return;
  }

  let suppliedOrigin: string;
  try {
    suppliedOrigin = new URL(originHeader).origin;
  } catch {
    throw new ServiceError("Request origin is not allowed", 403);
  }

  const allowedOrigins = new Set([new URL(request.url).origin]);
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host")?.trim();
  const forwardedProtocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
    new URL(request.url).protocol.replace(":", "");

  if (forwardedHost && (forwardedProtocol === "http" || forwardedProtocol === "https")) {
    try {
      allowedOrigins.add(new URL(`${forwardedProtocol}://${forwardedHost}`).origin);
    } catch {
      throw new ServiceError("Request origin is not allowed", 403);
    }
  }
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (configuredAppUrl) {
    try {
      allowedOrigins.add(new URL(configuredAppUrl).origin);
    } catch {
      throw new ServiceError("NEXT_PUBLIC_APP_URL must be a valid URL", 500);
    }
  }

  if (!allowedOrigins.has(suppliedOrigin)) {
    throw new ServiceError("Request origin is not allowed", 403);
  }
}
