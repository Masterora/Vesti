import { describe, expect, it } from "vitest";
import {
  amountIsPositive,
  amountRatioPercent,
  amountToUnits,
  amountsEqual,
  formatAmountUnits,
  safeAmountsEqual,
  sumAmountStrings
} from "./amount";

describe("amount helpers", () => {
  it("converts decimal strings to 6-decimal token units", () => {
    expect(amountToUnits("1")).toBe(BigInt(1000000));
    expect(amountToUnits("1.23")).toBe(BigInt(1230000));
    expect(amountToUnits("0.000001")).toBe(BigInt(1));
  });

  it("sums decimal strings without floating point drift", () => {
    expect(sumAmountStrings(["0.1", "0.2"])).toBe("0.3");
    expect(sumAmountStrings(["250", "749.999999", "0.000001"])).toBe("1000");
  });

  it("compares normalized amounts", () => {
    expect(amountsEqual("1.230000", "1.23")).toBe(true);
    expect(safeAmountsEqual("1.", "1")).toBe(false);
  });

  it("checks positivity without Number coercion", () => {
    expect(amountIsPositive("0")).toBe(false);
    expect(amountIsPositive("0.000001")).toBe(true);
    expect(amountIsPositive("not-an-amount")).toBe(false);
  });

  it("formats token units back to compact decimal strings", () => {
    expect(formatAmountUnits(BigInt(1000000))).toBe("1");
    expect(formatAmountUnits(BigInt(1234500))).toBe("1.2345");
  });

  it("computes progress percentages from token units", () => {
    expect(amountRatioPercent("1", "4")).toBe(25);
    expect(amountRatioPercent("5", "4")).toBe(100);
    expect(amountRatioPercent("0.1", "0.3")).toBe(33.33);
  });
});
