import { describe, expect, it } from "vitest";
import { assertTrustedRequestOrigin, getRequestClientIdentity } from "./request-security";

describe("request security", () => {
  it("accepts same-origin browser requests and requests without Origin", () => {
    expect(() =>
      assertTrustedRequestOrigin(
        new Request("https://vesti.example/api/test", {
          method: "POST",
          headers: { origin: "https://vesti.example" }
        })
      )
    ).not.toThrow();
    expect(() =>
      assertTrustedRequestOrigin(new Request("https://vesti.example/api/test", { method: "POST" }))
    ).not.toThrow();
  });

  it("rejects cross-origin browser requests", () => {
    expect(() =>
      assertTrustedRequestOrigin(
        new Request("https://vesti.example/api/test", {
          method: "POST",
          headers: { origin: "https://attacker.example" }
        })
      )
    ).toThrow("Request origin is not allowed");
  });

  it("accepts the public origin supplied by a trusted reverse proxy", () => {
    expect(() =>
      assertTrustedRequestOrigin(
        new Request("http://127.0.0.1:3100/api/test", {
          method: "POST",
          headers: {
            origin: "https://vesti.example",
            host: "127.0.0.1:3100",
            "x-forwarded-host": "vesti.example",
            "x-forwarded-proto": "https"
          }
        })
      )
    ).not.toThrow();
  });

  it("does not accept an unrelated origin behind a reverse proxy", () => {
    expect(() =>
      assertTrustedRequestOrigin(
        new Request("http://127.0.0.1:3100/api/test", {
          method: "POST",
          headers: {
            origin: "https://attacker.example",
            "x-forwarded-host": "vesti.example",
            "x-forwarded-proto": "https"
          }
        })
      )
    ).toThrow("Request origin is not allowed");
  });

  it("normalizes the proxy client address", () => {
    const request = new Request("https://vesti.example/api/test", {
      headers: { "x-forwarded-for": "203.0.113.8, 10.0.0.4" }
    });

    expect(getRequestClientIdentity(request)).toBe("203.0.113.8");
  });
});
