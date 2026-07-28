import Decimal from "decimal.js";

export class CalculationInputError extends Error {
  override readonly name = "CalculationInputError";
}

export function parseDecimal(
  value: string,
  field: string,
  options: {
    minimum?: string;
    maximum?: string;
    exclusiveMinimum?: string;
  } = {},
): Decimal {
  if (value.trim() === "") {
    throw new CalculationInputError(`${field} must be a decimal string`);
  }

  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    throw new CalculationInputError(`${field} must be a decimal string`);
  }

  if (!decimal.isFinite()) {
    throw new CalculationInputError(`${field} must be finite`);
  }
  if (options.minimum !== undefined && decimal.lt(options.minimum)) {
    throw new CalculationInputError(
      `${field} must be at least ${options.minimum}`,
    );
  }
  if (options.maximum !== undefined && decimal.gt(options.maximum)) {
    throw new CalculationInputError(
      `${field} must be at most ${options.maximum}`,
    );
  }
  if (
    options.exclusiveMinimum !== undefined &&
    decimal.lte(options.exclusiveMinimum)
  ) {
    throw new CalculationInputError(
      `${field} must be greater than ${options.exclusiveMinimum}`,
    );
  }

  return decimal;
}

export const formatDecimal = (value: Decimal): string => value.toFixed();
export const formatUsd = (value: Decimal): string => value.toFixed(8);
