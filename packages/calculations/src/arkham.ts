import type {
  ProjectWalletInput,
  ReviewStatus,
  WalletClassification,
} from "./types.js";

export type ArkhamAttributionClass =
  | "confirmed_entity"
  | "confirmed_address"
  | "predicted"
  | "rumored"
  | "project_token";

export type ArkhamOwnerClass =
  | "founder"
  | "team"
  | "foundation"
  | "treasury"
  | "company"
  | "custodial"
  | "exchange_customer_assets"
  | "unknown";

export interface ArkhamCandidate {
  provider: "arkham";
  entityId: string | null;
  entityName: string | null;
  queriedAlias: string;
  ownerFoundingUnitId: string | null;
  expectedProjectTokenSymbol: string;
  projectTokenSymbol: string;
  tokenQuantity: string | null;
  arkhamUsdValue: string | null;
  attributionClass: ArkhamAttributionClass;
  ownerClass: ArkhamOwnerClass;
  reviewStatus: ReviewStatus;
  ownershipConfidence: "high" | "medium" | "low" | "disputed";
  circulationFraction: string | null;
  custodial: boolean;
  predicted: boolean;
  rumored: boolean;
  projectTokenEquivalentKnown: boolean;
  deduplicationKey: string | null;
  evidenceIds: string[];
  address?: string | null;
}

export interface ArkhamAcceptance {
  scoreAffecting: boolean;
  exclusionReason: string | null;
  walletInput: ProjectWalletInput | null;
}

const scoreEligibleOwnerClasses = new Set<ArkhamOwnerClass>([
  "founder",
  "team",
  "foundation",
  "treasury",
  "company",
]);

function nonScoring(reason: string): ArkhamAcceptance {
  return { scoreAffecting: false, exclusionReason: reason, walletInput: null };
}

/**
 * Converts reviewed Arkham evidence into the existing wallet calculation
 * contract. Arkham USD values are deliberately not used here.
 */
export function evaluateArkhamCandidate(
  candidate: ArkhamCandidate,
): ArkhamAcceptance {
  if (candidate.provider !== "arkham")
    return nonScoring("unsupported_provider");
  if (candidate.predicted || candidate.attributionClass === "predicted") {
    return nonScoring("predicted_address_excluded");
  }
  if (candidate.rumored || candidate.attributionClass === "rumored") {
    return nonScoring("rumored_address_excluded");
  }
  if (
    candidate.custodial ||
    candidate.ownerClass === "custodial" ||
    candidate.ownerClass === "exchange_customer_assets"
  ) {
    return nonScoring("custodial_or_customer_assets_excluded");
  }
  if (!candidate.entityId || !candidate.entityName) {
    return nonScoring("entity_mapping_incomplete");
  }
  if (!candidate.ownerFoundingUnitId) {
    return nonScoring("owner_mapping_incomplete");
  }
  if (!scoreEligibleOwnerClasses.has(candidate.ownerClass)) {
    return nonScoring("owner_class_not_eligible");
  }
  if (
    candidate.attributionClass !== "confirmed_entity" &&
    candidate.attributionClass !== "confirmed_address"
  ) {
    return nonScoring("attribution_not_confirmed");
  }
  if (candidate.reviewStatus !== "approved_sufficient") {
    return nonScoring("review_not_approved");
  }
  if (candidate.ownershipConfidence !== "high") {
    return nonScoring("ownership_confidence_not_high");
  }
  if (!candidate.projectTokenEquivalentKnown) {
    return nonScoring("token_equivalence_unknown");
  }
  if (
    candidate.projectTokenSymbol.trim().toUpperCase() !==
    candidate.expectedProjectTokenSymbol.trim().toUpperCase()
  )
    return nonScoring("unrelated_token_excluded");
  const tokenQuantity =
    candidate.tokenQuantity === null ? null : Number(candidate.tokenQuantity);
  if (
    tokenQuantity === null ||
    !Number.isFinite(tokenQuantity) ||
    tokenQuantity < 0
  ) {
    return nonScoring("project_token_quantity_unknown");
  }
  if (candidate.circulationFraction === null) {
    return nonScoring("circulation_treatment_unknown");
  }
  if (!candidate.deduplicationKey) {
    return nonScoring("deduplication_key_missing");
  }
  if (candidate.evidenceIds.length === 0) {
    return nonScoring("evidence_missing");
  }

  const walletClassification: WalletClassification =
    candidate.ownerClass === "company"
      ? "founder_controlled_company"
      : candidate.ownerClass;
  return {
    scoreAffecting: true,
    exclusionReason: null,
    walletInput: {
      walletId: `arkham:${candidate.entityId}`,
      deduplicationKey: candidate.deduplicationKey,
      normalizedBalance: candidate.tokenQuantity,
      circulatingInclusionFraction: candidate.circulationFraction,
      balanceIncludedInCirculatingSupply: true,
      affectsScore: true,
      classification: walletClassification,
      ownershipConfidence: "high",
      reviewStatus: "approved_sufficient",
      evidenceComplete: true,
    },
  };
}
