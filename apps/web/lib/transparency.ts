import assetsJson from "../../../data/assets.json";
import foundingUnitsJson from "../../../data/founding-units.json";
import fundingRoundsJson from "../../../data/funding-rounds.json";
import projectsJson from "../../../data/projects.json";
import recordSourcesJson from "../../../data/record-sources.json";
import sourcesJson from "../../../data/sources.json";
import walletsJson from "../../../data/tracked-wallets.json";

export interface ProjectRecord {
  id: string;
  slug: string;
  name: string;
  symbol: string | null;
  description: string;
  confidenceLevel: string;
  methodologyNotes: string;
  websiteUrl: string;
  researchReviewedAt: string;
  status: string;
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
  amountUsdAtEvent: string;
  conversionMethod?: string;
  includeInCapitalDeduction: boolean;
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

const projects = projectsJson as ProjectRecord[];
const foundingUnits = foundingUnitsJson as FoundingUnitRecord[];
const assets = assetsJson as AssetRecord[];
const wallets = walletsJson as WalletRecord[];
const fundingRounds = fundingRoundsJson as FundingRoundRecord[];
const sources = sourcesJson as SourceRecord[];
const recordSources = recordSourcesJson as Array<{
  id: string;
  sourceId: string;
  recordType: string;
  recordId: string;
  field: string;
  supportType: string;
}>;

function projectIdForRecord(
  recordType: string,
  recordId: string,
): string | null {
  if (recordType === "project") return recordId;
  if (recordType === "founding_unit") {
    return (
      foundingUnits.find(({ id }) => id === recordId)?.projectLinks[0]
        ?.projectId ?? null
    );
  }
  if (recordType === "asset") {
    return assets.find(({ id }) => id === recordId)?.projectId ?? null;
  }
  if (recordType === "tracked_wallet") {
    return wallets.find(({ id }) => id === recordId)?.projectId ?? null;
  }
  if (recordType === "funding_round") {
    return fundingRounds.find(({ id }) => id === recordId)?.projectId ?? null;
  }
  return null;
}

export function getAllSourceClaims(): SourceClaim[] {
  return recordSources.flatMap((claim) => {
    const projectId = projectIdForRecord(claim.recordType, claim.recordId);
    const project = projects.find(({ id }) => id === projectId);
    const source = sources.find(({ id }) => id === claim.sourceId);
    if (!projectId || !project || !source) return [];
    return [
      {
        ...claim,
        projectId,
        projectSlug: project.slug,
        projectName: project.name,
        source,
      },
    ];
  });
}

export function getProjectSlugs(): string[] {
  return projects
    .filter(({ status }) => status === "active")
    .map(({ slug }) => slug);
}

export function getProjectEvidence(slug: string): ProjectEvidence | null {
  const project = projects.find(
    (item) => item.slug === slug && item.status === "active",
  );
  if (!project) return null;
  return {
    project,
    foundingUnit:
      foundingUnits.find((unit) =>
        unit.projectLinks.some((link) => link.projectId === project.id),
      ) ?? null,
    asset:
      assets.find(
        (asset) => asset.projectId === project.id && asset.isPrimary,
      ) ?? null,
    wallets: wallets.filter((wallet) => wallet.projectId === project.id),
    fundingRounds: fundingRounds.filter(
      (round) => round.projectId === project.id,
    ),
    sourceClaims: getAllSourceClaims().filter(
      (claim) => claim.projectId === project.id,
    ),
  };
}

export function calculateScoreBreakdown(input: {
  marketCapUsd: number;
  excludedValueUsd: number;
  capitalRaisedUsd: number;
}) {
  return input.marketCapUsd - input.excludedValueUsd - input.capitalRaisedUsd;
}

export function explorerUrl(chainCode: string, address: string): string | null {
  if (chainCode === "ethereum")
    return `https://etherscan.io/address/${address}`;
  if (chainCode === "solana") return `https://solscan.io/account/${address}`;
  return null;
}
