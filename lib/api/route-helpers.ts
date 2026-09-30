import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertTrustedRequestOrigin } from "@/lib/api/request-security";
import { translateErrorMessage } from "@/lib/i18n/error-messages";
import { getRequestLocale } from "@/lib/i18n/locale";
import { ServiceError } from "@/lib/services/errors";

const requestIdHeader = "x-request-id";

export function getRequestId(request: Request) {
  const suppliedRequestId = request.headers.get(requestIdHeader)?.trim();

  if (
    suppliedRequestId &&
    suppliedRequestId.length <= 128 &&
    /^[\x21-\x7e]+$/.test(suppliedRequestId)
  ) {
    return suppliedRequestId;
  }

  return crypto.randomUUID();
}

function createJsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  requestId = getRequestId(request),
  headers?: HeadersInit,
) {
  const response = NextResponse.json(body, { status, headers });
  response.headers.set(requestIdHeader, requestId);

  return response;
}

export function createRouteSuccessResponse(
  request: Request,
  data: unknown,
  options?: { status?: number; headers?: HeadersInit },
) {
  return createJsonResponse(
    request,
    { data },
    options?.status ?? 200,
    getRequestId(request),
    options?.headers,
  );
}

export async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ServiceError("Request body must be valid JSON", 400);
  }
}

export function createRouteErrorResponse(request: Request, error: unknown) {
  const locale = getRequestLocale(request);
  const requestId = getRequestId(request);

  if (error instanceof ServiceError) {
    return createJsonResponse(
      request,
      {
        error: translateErrorMessage(locale, error.message),
        code: error.code,
        requestId,
      },
      error.status,
      requestId,
    );
  }

  if (error instanceof ZodError) {
    return createJsonResponse(
      request,
      {
        error: translateErrorMessage(locale, "Invalid request body"),
        details: error.flatten(),
        requestId,
      },
      400,
      requestId,
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const target = Array.isArray(error.meta?.target)
      ? error.meta.target
      : typeof error.meta?.target === "string"
        ? [error.meta.target]
        : [];

    if (error.code === "P2002" && target.includes("email")) {
      return createJsonResponse(
        request,
        {
          error: translateErrorMessage(
            locale,
            "Email address is already in use",
          ),
          requestId,
        },
        409,
        requestId,
      );
    }

    if (error.code === "P2002") {
      return createJsonResponse(
        request,
        {
          error: translateErrorMessage(
            locale,
            "This operation was already submitted",
          ),
          requestId,
        },
        409,
        requestId,
      );
    }

    if (error.code === "P2034") {
      return createJsonResponse(
        request,
        {
          error: translateErrorMessage(
            locale,
            "The contract changed during this operation. Please retry.",
          ),
          requestId,
        },
        409,
        requestId,
      );
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return createJsonResponse(
      request,
      {
        error: translateErrorMessage(locale, "Database is unavailable"),
        details: translateErrorMessage(
          locale,
          "Check DATABASE_URL and make sure PostgreSQL is running.",
        ),
        requestId,
      },
      503,
      requestId,
    );
  }

  console.error("Unhandled API route error", {
    requestId,
    method: request.method,
    path: new URL(request.url).pathname,
    error,
  });
  return createJsonResponse(
    request,
    {
      error: translateErrorMessage(locale, "Internal server error"),
      requestId,
    },
    500,
    requestId,
  );
}

export async function handleRoute<T>(
  request: Request,
  handler: () => Promise<T>,
  options?: { status: (data: T) => number },
) {
  try {
    assertTrustedRequestOrigin(request);
    const data = await handler();
    return createRouteSuccessResponse(
      request,
      data,
      options ? { status: options.status(data) } : undefined,
    );
  } catch (error) {
    return createRouteErrorResponse(request, error);
  }
}
