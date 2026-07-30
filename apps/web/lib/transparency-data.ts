import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { shouldUseSyntheticFixtures } from "./data-mode";
import type {
  AssetRecord,
  FoundingUnitRecord,
  FundingRoundRecord,
  ProjectEvidence,
  ProjectRecord,
  SourceClaim,
  SourceRecord,
  WalletRecord,
} from "./transparency";

interface RecordSource {
  id: string;
  sourceId: string;
  recordType: string;
  recordId: string;
  field: string;
  supportType: string;
}

function readCuratedData<T>(fileName: string): T {
  const dataDirectory = shouldUseSyntheticFixtures()
    ? "data"
    : "data/production";
  const filePath = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    "../..",
    dataDirectory,
    fileName,
  );
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

const projects = readCuratedData<ProjectRecord[]>("projects.json");
const foundingUnits = readCuratedData<FoundingUnitRecord[]>(
  "founding-units.json",
);
const assets = readCuratedData<AssetRecord[]>("assets.json");
const wallets = readCuratedData<WalletRecord[]>("tracked-wallets.json");
const fundingRounds = readCuratedData<FundingRoundRecord[]>(
  "funding-rounds.json",
);
const sources = readCuratedData<SourceRecord[]>("sources.json");
const recordSources = readCuratedData<RecordSource[]>("record-sources.json");

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
