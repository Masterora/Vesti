import { describe, expect, it } from "vitest";
import { ServiceError } from "@/lib/services/errors";
import { createRouteErrorResponse, getRequestId, handleRoute } from "./route-helpers";

describe("API route helpers", () => {
  it("preserves a valid caller request ID on successful responses", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "x-request-id": "request-from-edge" }
    });
    const response = await handleRoute(request, async () => ({ ok: true }));

    expect(response.headers.get("x-request-id")).toBe("request-from-edge");
    await expect(response.json()).resolves.toEqual({ data: { ok: true } });
  });

  it("generates an ID when the incoming value is absent or invalid", () => {
    const missing = getRequestId(new Request("http://localhost/api/test"));
    const invalid = getRequestId(
      new Request("http://localhost/api/test", { headers: { "x-request-id": "contains spaces" } })
    );

    expect(missing).toMatch(/^[0-9a-f-]{36}$/);
    expect(invalid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns the same request ID in an error header and body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "x-request-id": "failed-request" }
    });
    const response = createRouteErrorResponse(request, new ServiceError("Not allowed", 403));

    expect(response.status).toBe(403);
    expect(response.headers.get("x-request-id")).toBe("failed-request");
    await expect(response.json()).resolves.toMatchObject({ requestId: "failed-request" });
  });
});
