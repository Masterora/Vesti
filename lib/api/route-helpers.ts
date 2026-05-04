import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ServiceError } from "@/lib/services/errors";

export async function parseJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ServiceError("Request body must be valid JSON", 400);
  }
}

export async function handleRoute<T>(handler: () => Promise<T>) {
  try {
    const data = await handler();
    return NextResponse.json({ data });
  } catch (error) {
    if (error instanceof ServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: error.flatten()
        },
        { status: 400 }
      );
    }

    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
