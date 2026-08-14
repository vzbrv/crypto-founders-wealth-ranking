/**
 * Pure per-entry valuation math for the hourly ranking snapshot.
 *
 * This is a pure, testable boundary for the hourly ranking valuation. It uses
 * the same Decimal arithmetic as the shared calculation packages so values
 * remain exact until they are formatted for publication.
 */

import Decimal from "decimal.js";

export interface OutsideCapitalEventInput {
  amountUsd: string;
  disposition: "Accepted" | "Excluded" | "Disputed" | "Scenario-only";
}

export interface OutsideCapitalInput {
  status: "Accepted" | "Unknown";
  events: OutsideCapitalEventInput[];
}

export interface AffiliatedOwnershipInput {
  status: "Accepted" | "Unknown" | "Excluded";
  totalShares?: string;
}

export type MarketValuationInput =
  | { type: "token"; marketCap: string | number }
  | {
      type: "public";
      price: string | number;
      shareClasses: Array<{ sharesOutstanding: string }>;
    };

export interface EntryValuationInput {
  entryId: string;
  market: MarketValuationInput;
  affiliatedOwnership: AffiliatedOwnershipInput;
  outsideCapital: OutsideCapitalInput;
}

export interface EntryValuationResult {
  grossValueUsd: string;
  founderAffiliateDeductionUsd: string | null;
  outsideCapitalDeductionUsd: string | null;
  finalValueUsd: string;
}

function parseNonNegativeDecimal(
  value: string | number,
  label: string,
): Decimal {
  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    throw new Error(`invalid ${label}`);
  }
  if (!decimal.isFinite() || decimal.lt(0)) throw new Error(`invalid ${label}`);
  return decimal;
}

export function computeEntryValuation(
  input: EntryValuationInput,
): EntryValuationResult {
  if (
    input.market.type === "token" &&
    input.affiliatedOwnership.status === "Accepted"
  ) {
    throw new Error(
      `accepted token ownership is unsupported for ${input.entryId}; provide a calculable token supply/price model`,
    );
  }

  let gross: Decimal;
  let marketPrice: Decimal | null = null;

  if (input.market.type === "token") {
    gross = parseNonNegativeDecimal(
      input.market.marketCap,
      `gross value for ${input.entryId}`,
    );
  } else {
    marketPrice = parseNonNegativeDecimal(
      input.market.price,
      `market price for ${input.entryId}`,
    );
    gross = input.market.shareClasses.reduce(
      (total, shareClass) =>
        total.plus(
          parseNonNegativeDecimal(
            shareClass.sharesOutstanding,
            `shares outstanding for ${input.entryId}`,
          ).times(marketPrice!),
        ),
      new Decimal(0),
    );
  }

  const founderAffiliateDeduction =
    input.market.type === "public" &&
    input.affiliatedOwnership.status === "Accepted" &&
    input.affiliatedOwnership.totalShares !== undefined
      ? parseNonNegativeDecimal(
          input.affiliatedOwnership.totalShares,
          `affiliate shares for ${input.entryId}`,
        ).times(marketPrice!)
      : null;

  const outsideCapitalDeduction =
    input.outsideCapital.status === "Accepted"
      ? input.outsideCapital.events
          .filter((event) => event.disposition === "Accepted")
          .reduce(
            (total, event) =>
              total.plus(
                parseNonNegativeDecimal(
                  event.amountUsd,
                  `outside capital for ${input.entryId}`,
                ),
              ),
            new Decimal(0),
          )
      : null;

  let finalValue = gross;
  if (founderAffiliateDeduction !== null) {
    finalValue = finalValue.minus(founderAffiliateDeduction);
  }
  if (outsideCapitalDeduction !== null) {
    finalValue = finalValue.minus(outsideCapitalDeduction);
  }

  if (!finalValue.isFinite() || finalValue.lt(0)) {
    throw new Error(`invalid final value for ${input.entryId}`);
  }

  return {
    grossValueUsd: gross.toString(),
    founderAffiliateDeductionUsd: founderAffiliateDeduction?.toString() ?? null,
    outsideCapitalDeductionUsd: outsideCapitalDeduction?.toString() ?? null,
    finalValueUsd: finalValue.toString(),
  };
}
