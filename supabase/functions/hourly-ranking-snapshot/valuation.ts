/**
 * Pure per-entry valuation math for the hourly ranking snapshot.
 *
 * This is a faithful extraction of the arithmetic that used to live inline
 * inside the `Deno.serve` handler in index.ts — same operations, same error
 * conditions, same order of operations. Pulling it out here makes it
 * testable with a plain test runner (no Deno.serve, no fetch mocking, no
 * Supabase), and gives future changes to this math a place to add
 * regression tests before they ship.
 *
 * NOTE ON PRECISION: this module intentionally mirrors the existing
 * behavior, which uses native `number` arithmetic (not `Decimal`, unlike
 * `packages/calculations`). That's a real difference from the rest of the
 * codebase worth revisiting — see the audit notes — but this extraction
 * does not change behavior on its own.
 */

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
  | { type: "token"; marketCap: number }
  | {
      type: "public";
      price: number;
      shareClasses: Array<{ sharesOutstanding: string }>;
    };

export interface EntryValuationInput {
  entryId: string;
  market: MarketValuationInput;
  affiliatedOwnership: AffiliatedOwnershipInput;
  outsideCapital: OutsideCapitalInput;
}

export interface EntryValuationResult {
  grossValueUsd: number;
  founderAffiliateDeductionUsd: number | null;
  outsideCapitalDeductionUsd: number | null;
  finalValueUsd: number;
}

export function computeEntryValuation(
  input: EntryValuationInput,
): EntryValuationResult {
  let gross: number;
  let marketPrice: number | null = null;

  if (input.market.type === "token") {
    gross = input.market.marketCap;
  } else {
    marketPrice = input.market.price;
    gross = input.market.shareClasses.reduce(
      (total, shareClass) =>
        total + Number(shareClass.sharesOutstanding) * marketPrice!,
      0,
    );
  }

  if (!Number.isFinite(gross) || gross < 0) {
    throw new Error(`invalid gross value for ${input.entryId}`);
  }

  const founderAffiliateDeductionUsd =
    input.market.type === "public" &&
    input.affiliatedOwnership.status === "Accepted"
      ? Number(input.affiliatedOwnership.totalShares ?? 0) * marketPrice!
      : null;

  const outsideCapitalDeductionUsd =
    input.outsideCapital.status === "Accepted"
      ? input.outsideCapital.events
          .filter((event) => event.disposition === "Accepted")
          .reduce((total, event) => total + Number(event.amountUsd), 0)
      : null;

  const finalValueUsd =
    gross -
    (founderAffiliateDeductionUsd ?? 0) -
    (outsideCapitalDeductionUsd ?? 0);

  if (!Number.isFinite(finalValueUsd) || finalValueUsd < 0) {
    throw new Error(`invalid final value for ${input.entryId}`);
  }

  return {
    grossValueUsd: gross,
    founderAffiliateDeductionUsd,
    outsideCapitalDeductionUsd,
    finalValueUsd,
  };
}
