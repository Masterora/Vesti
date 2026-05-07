export const DEFAULT_AMOUNT_DECIMALS = 6;

function multiplierFor(decimals: number) {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error("Token decimals must be a non-negative integer");
  }

  return BigInt(10) ** BigInt(decimals);
}

export function amountToUnits(value: string | number, decimals = DEFAULT_AMOUNT_DECIMALS) {
  const rawAmount = String(value).trim();

  if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
    throw new Error("Amount must be a positive decimal string");
  }

  const [wholePart, fractionPart = ""] = rawAmount.split(".");

  if (fractionPart.length > decimals) {
    throw new Error(`Amount cannot have more than ${decimals} decimal places`);
  }

  const multiplier = multiplierFor(decimals);
  const wholeUnits = BigInt(wholePart) * multiplier;
  const fractionUnits = BigInt(fractionPart.padEnd(decimals, "0") || "0");

  return wholeUnits + fractionUnits;
}

export function amountIsPositive(value: string | number, decimals = DEFAULT_AMOUNT_DECIMALS) {
  try {
    return amountToUnits(value, decimals) > BigInt(0);
  } catch {
    return false;
  }
}

export function formatAmountUnits(units: bigint, decimals = DEFAULT_AMOUNT_DECIMALS) {
  const multiplier = multiplierFor(decimals);
  const wholePart = units / multiplier;
  const fractionPart = units % multiplier;

  if (fractionPart === BigInt(0)) {
    return wholePart.toString();
  }

  const fraction = fractionPart.toString().padStart(decimals, "0").replace(/0+$/, "");

  return `${wholePart.toString()}.${fraction}`;
}

export function sumAmountStrings(values: Array<string | number>, decimals = DEFAULT_AMOUNT_DECIMALS) {
  const total = values.reduce((sum, value) => sum + amountToUnits(value, decimals), BigInt(0));

  return formatAmountUnits(total, decimals);
}

export function amountsEqual(
  left: string | number,
  right: string | number,
  decimals = DEFAULT_AMOUNT_DECIMALS
) {
  return amountToUnits(left, decimals) === amountToUnits(right, decimals);
}

export function safeAmountsEqual(
  left: string | number,
  right: string | number,
  decimals = DEFAULT_AMOUNT_DECIMALS
) {
  try {
    return amountsEqual(left, right, decimals);
  } catch {
    return false;
  }
}

export function amountRatioPercent(
  part: string | number,
  total: string | number,
  decimals = DEFAULT_AMOUNT_DECIMALS
) {
  try {
    const partUnits = amountToUnits(part, decimals);
    const totalUnits = amountToUnits(total, decimals);

    if (totalUnits <= BigInt(0)) {
      return 0;
    }

    const basisPoints = (partUnits * BigInt(10000)) / totalUnits;

    return Math.min(Number(basisPoints) / 100, 100);
  } catch {
    return 0;
  }
}
