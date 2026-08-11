import Decimal from "decimal.js";

export type ValueChangeSource = "fallback" | "live" | "v2";

export type ValueChangeDisplay = {
  text: string;
  label: string;
};

const unavailable: ValueChangeDisplay = {
  text: "—",
  label: "Previous snapshot value is unavailable",
};

export function formatValueChange(
  value: string | number | null,
  source: ValueChangeSource,
): ValueChangeDisplay {
  if (source !== "live" || value === null) {
    return unavailable;
  }

  let change: Decimal;
  try {
    change = new Decimal(value);
  } catch {
    return unavailable;
  }

  if (!change.isFinite()) {
    return unavailable;
  }

  if (change.isZero()) {
    return {
      text: "—",
      label: "Value unchanged since previous snapshot",
    };
  }

  const absolute = change.abs().toNumber();
  if (!Number.isFinite(absolute)) {
    return unavailable;
  }

  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(absolute);

  return change.isPositive()
    ? {
        text: `+${formatted}`,
        label: `Value increased by ${formatted} since previous snapshot`,
      }
    : {
        text: `−${formatted}`,
        label: `Value decreased by ${formatted} since previous snapshot`,
      };
}
