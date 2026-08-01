import "server-only";

import { resolve } from "node:path";

import {
  buildProvisionalCalculations,
  buildProvisionalRanking,
  loadResearchData,
  type ProvisionalCalculation,
  type ProvisionalRankingEntry,
  type ResearchCandidate,
  type ResearchDataset,
} from "@crypto-founders/curated-data/research";

const RESEARCH_DIRECTORY = resolve(process.cwd(), "../..", "data/research");

export type ResearchCandidateSummary = Pick<
  ResearchCandidate,
  | "snapshotDate"
  | "projectId"
  | "project"
  | "ticker"
  | "foundersTeam"
  | "provisionalOutsideWealthUsd"
  | "canonicalOutsideWealthUsd"
  | "publicationStatus"
  | "grossStatus"
  | "founderHoldingsStatus"
  | "capitalStatus"
  | "grossScreenRank"
  | "missingEvidence"
>;

export interface ResearchSnapshot {
  snapshotDate: string;
  totalCandidates: number;
  readyCandidates: number;
  candidates: ResearchCandidateSummary[];
}

let datasetPromise: Promise<ResearchDataset> | undefined;

export function getResearchDataset(): Promise<ResearchDataset> {
  datasetPromise ??= loadResearchData(RESEARCH_DIRECTORY);
  return datasetPromise;
}

export async function getResearchProjectIds(): Promise<string[]> {
  return (await getResearchDataset()).candidates.map(
    ({ projectId }) => projectId,
  );
}

export async function getResearchCandidate(
  projectId: string,
): Promise<ResearchCandidate | undefined> {
  return (await getResearchDataset()).candidates.find(
    (candidate) => candidate.projectId === projectId,
  );
}

export async function getResearchSnapshot(): Promise<ResearchSnapshot> {
  const { candidates } = await getResearchDataset();
  return {
    snapshotDate: candidates[0]?.snapshotDate ?? "unknown",
    totalCandidates: candidates.length,
    readyCandidates: candidates.filter(
      ({ publicationStatus }) => publicationStatus === "Ready",
    ).length,
    candidates: candidates.map((candidate) => ({
      snapshotDate: candidate.snapshotDate,
      projectId: candidate.projectId,
      project: candidate.project,
      ticker: candidate.ticker,
      foundersTeam: candidate.foundersTeam,
      provisionalOutsideWealthUsd: candidate.provisionalOutsideWealthUsd,
      canonicalOutsideWealthUsd: candidate.canonicalOutsideWealthUsd,
      publicationStatus: candidate.publicationStatus,
      grossStatus: candidate.grossStatus,
      founderHoldingsStatus: candidate.founderHoldingsStatus,
      capitalStatus: candidate.capitalStatus,
      grossScreenRank: candidate.grossScreenRank,
      missingEvidence: candidate.missingEvidence,
    })),
  };
}

export async function getProvisionalRanking(): Promise<
  ProvisionalRankingEntry[]
> {
  return buildProvisionalRanking(await getResearchDataset());
}

export async function getProvisionalProjectIds(): Promise<string[]> {
  return buildProvisionalCalculations(await getResearchDataset()).map(
    ({ projectId }) => projectId,
  );
}

export async function getProvisionalCalculation(
  projectId: string,
): Promise<ProvisionalCalculation | undefined> {
  return buildProvisionalCalculations(await getResearchDataset()).find(
    (calculation) => calculation.projectId === projectId,
  );
}
