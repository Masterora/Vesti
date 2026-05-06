import { describe, expect, it } from "vitest";
import { amountSchema } from "./shared";

describe("amountSchema", () => {
  it("accepts positive decimal strings with up to 6 decimals", () => {
    expect(amountSchema.parse("1")).toBe("1");
    expect(amountSchema.parse("0.000001")).toBe("0.000001");
    expect(amountSchema.parse("1000.123456")).toBe("1000.123456");
  });

  it("rejects zero, negative, malformed, and over-precision values", () => {
    expect(() => amountSchema.parse("0")).toThrow();
    expect(() => amountSchema.parse("-1")).toThrow();
    expect(() => amountSchema.parse("1.")).toThrow();
    expect(() => amountSchema.parse("1.1234567")).toThrow();
  });
});
