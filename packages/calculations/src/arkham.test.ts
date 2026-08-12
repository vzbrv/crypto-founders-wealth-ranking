import { describe, expect, it } from "vitest";
import { calculateExcludedSupply, evaluateArkhamCandidate } from "./index.js";
import type { ArkhamCandidate } from "./arkham.js";

const base: ArkhamCandidate = {
  provider: "arkham",
  entityId: "entity-1",
  entityName: "Example Founder",
  queriedAlias: "Example Founder",
  ownerFoundingUnitId: "ethereum:vitalik-buterin",
  expectedProjectTokenSymbol: "ETH",
  projectTokenSymbol: "ETH",
  tokenQuantity: "100",
  arkhamUsdValue: "999999999",
  attributionClass: "confirmed_entity",
  ownerClass: "founder",
  reviewStatus: "approved_sufficient",
  ownershipConfidence: "high",
  circulationFraction: "0.5",
  custodial: false,
  predicted: false,
  rumored: false,
  projectTokenEquivalentKnown: true,
  deduplicationKey: "entity-1:ETH",
  evidenceIds: ["evidence-1"],
};

const score = (candidate: ArkhamCandidate = base) => {
  const accepted = evaluateArkhamCandidate(candidate);
  return calculateExcludedSupply(
    accepted.walletInput ? [accepted.walletInput] : [],
    "approved_sufficient",
  );
};

describe("Arkham acceptance gate", () => {
  it("uses token quantity and not Arkham USD value", () => {
    expect(score().knownExcludedSupply).toBe("50");
  });

  it.each([
    ["predicted", { predicted: true }],
    ["rumored", { rumored: true, attributionClass: "rumored" as const }],
    ["custodial", { custodial: true, ownerClass: "custodial" as const }],
    ["unrelated token", { projectTokenSymbol: "USDC" }],
    ["ambiguous entity", { entityId: null, entityName: null }],
    ["incomplete review", { reviewStatus: "reviewed_insufficient" as const }],
    ["unknown circulation", { circulationFraction: null }],
  ])("keeps %s non-scoring", (_label, changes) => {
    const accepted = evaluateArkhamCandidate({ ...base, ...changes });
    expect(accepted.scoreAffecting).toBe(false);
    expect(score({ ...base, ...changes }).knownExcludedSupply).toBe("0");
  });

  it("does not double-count a duplicate key", () => {
    const accepted = evaluateArkhamCandidate(base).walletInput!;
    const result = calculateExcludedSupply(
      [accepted, { ...accepted, walletId: "arkham:entity-2" }],
      "approved_sufficient",
    );
    expect(result.knownExcludedSupply).toBe("50");
    expect(
      result.warnings.some(
        (warning) => warning.code === "DUPLICATE_WALLET_DEDUCTION",
      ),
    ).toBe(true);
  });

  it("accepts reviewed eligible affiliated owner classes", () => {
    for (const ownerClass of [
      "team",
      "foundation",
      "treasury",
      "company",
    ] as const) {
      const accepted = evaluateArkhamCandidate({ ...base, ownerClass });
      expect(accepted.scoreAffecting).toBe(true);
      expect(accepted.walletInput?.classification).toBe(
        ownerClass === "company" ? "founder_controlled_company" : ownerClass,
      );
    }
  });

  it("does not score an unmapped owner or an unknown Arkham response", () => {
    expect(
      score({ ...base, ownerFoundingUnitId: null }).knownExcludedSupply,
    ).toBe("0");
    expect(score({ ...base, tokenQuantity: null }).knownExcludedSupply).toBe(
      "0",
    );
  });

  it("preserves Unknown for accepted evidence with a missing balance", () => {
    const accepted = evaluateArkhamCandidate(base).walletInput!;
    const result = calculateExcludedSupply(
      [{ ...accepted, normalizedBalance: null }],
      "reviewed_insufficient",
    );
    expect(result.excludedSupply).toBeNull();
    expect(result.knownExcludedSupply).toBeNull();
  });

  it("rejects wrapped or staked representations without known equivalence", () => {
    const accepted = evaluateArkhamCandidate({
      ...base,
      projectTokenSymbol: "WETH",
      projectTokenEquivalentKnown: false,
    });
    expect(accepted.scoreAffecting).toBe(false);
    expect(accepted.exclusionReason).toBe("token_equivalence_unknown");
  });
});
