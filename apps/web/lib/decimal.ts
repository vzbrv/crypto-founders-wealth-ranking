import Decimal from "decimal.js";

export type DecimalString = string;

export function decimalOrNull(value: unknown): DecimalString | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const parsed = new Decimal(String(value));
    return parsed.isFinite() ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function compareDecimals(
  left: DecimalString | null,
  right: DecimalString | null,
): number {
  if (left === null && right === null) return 0;
  if (left === null) return -1;
  if (right === null) return 1;
  return new Decimal(left).cmp(new Decimal(right));
}
