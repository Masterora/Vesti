import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { translateErrorMessage } from "@/lib/i18n/error-messages";
import { getRequestLocale } from "@/lib/i18n/locale";
import { ServiceError } from "@/lib/services/errors";

export async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ServiceError("Request body must be valid JSON", 400);
  }
}

export function createRouteErrorResponse(request: Request, error: unknown) {
  const locale = getRequestLocale(request);

  if (error instanceof ServiceError) {
    return NextResponse.json(
      { error: translateErrorMessage(locale, error.message) },
      { status: error.status }
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: translateErrorMessage(locale, "Invalid request body"),
        details: error.flatten()
      },
      { status: 400 }
    );
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json(
      {
        error: translateErrorMessage(locale, "Database is unavailable"),
        details: translateErrorMessage(locale, "Check DATABASE_URL and make sure PostgreSQL is running.")
      },
      { status: 503 }
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: translateErrorMessage(locale, "Internal server error") },
    { status: 500 }
  );
}

export async function handleRoute<T>(request: Request, handler: () => Promise<T>) {
  try {
    const data = await handler();
    return NextResponse.json({ data });
  } catch (error) {
    return createRouteErrorResponse(request, error);
  }
}
