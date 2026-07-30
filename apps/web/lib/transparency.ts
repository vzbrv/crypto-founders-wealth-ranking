export interface ProjectRecord {
  id: string;
  slug: string;
  name: string;
  symbol: string | null;
  description: string;
  confidenceLevel: string;
  walletReview: ReviewRecord;
  fundingReview: ReviewRecord;
  methodologyNotes: string;
  websiteUrl: string;
  researchReviewedAt: string;
  status: string;
}

export interface ReviewRecord {
  status:
    | "not_reviewed"
    | "in_progress"
    | "approved_sufficient"
    | "reviewed_insufficient";
  reviewer: string | null;
  reviewedAt: string | null;
  notes: string | null;
  evidenceSourceIds: string[];
}

export interface FoundingUnitRecord {
  id: string;
  slug: string;
  displayName: string;
  description: string;
  researchReviewedAt: string;
  projectLinks: Array<{
    projectId: string;
    attributionFraction: string;
    attributionMethod: string;
  }>;
}

export interface AssetRecord {
  id: string;
  projectId: string;
  symbol: string;
  name: string;
  chainCode: string;
  contractAddress?: string;
  isPrimary: boolean;
}

export interface WalletRecord {
  id: string;
  projectId: string;
  assetIds: string[];
  chainCode: string;
  address: string;
  label: string;
  classification: string;
  ownershipConfidence: string;
  circulatingInclusionFraction: string | null;
  affectsScore: boolean;
  balanceIncludedInCirculatingSupply: boolean | null;
  deduplicationKey: string;
  reviewStatus: ReviewRecord["status"];
  reviewer: string | null;
  reviewedAt: string | null;
  evidenceSourceIds: string[];
  researchReviewedAt: string;
  notes: string;
}

export interface FundingRoundRecord {
  id: string;
  projectId: string;
  eventDate: string;
  roundType: string;
  originalAmount?: string;
  originalCurrency?: string;
  amountUsdAtEvent?: string;
  conversionMethod?: string;
  includeInCapitalDeduction: boolean;
  deduplicationKey: string;
  reviewStatus: ReviewRecord["status"];
  reviewer: string | null;
  evidenceSourceIds: string[];
  reviewedAt: string;
  notes: string;
}

export interface SourceRecord {
  id: string;
  title: string;
  url: string;
  publisher: string;
  sourceType: string;
  publishedAt?: string;
  accessedAt: string;
  description: string;
}

export interface SourceClaim {
  id: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  recordType: string;
  recordId: string;
  field: string;
  supportType: string;
  source: SourceRecord;
}

export interface ProjectEvidence {
  project: ProjectRecord;
  foundingUnit: FoundingUnitRecord | null;
  asset: AssetRecord | null;
  wallets: WalletRecord[];
  fundingRounds: FundingRoundRecord[];
  sourceClaims: SourceClaim[];
}

export function calculateScoreBreakdown(input: {
  marketCapUsd: number;
  excludedValueUsd: number;
  capitalRaisedUsd: number;
}) {
  return Math.max(
    0,
    input.marketCapUsd - input.excludedValueUsd - input.capitalRaisedUsd,
  );
}

export function explorerUrl(chainCode: string, address: string): string | null {
  if (chainCode === "ethereum")
    return `https://etherscan.io/address/${address}`;
  if (chainCode === "solana") return `https://solscan.io/account/${address}`;
  return null;
}
