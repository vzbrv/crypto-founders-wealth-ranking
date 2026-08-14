import "server-only";

import { resolve } from "node:path";

import {
  buildUnifiedRanking,
  loadUnifiedData,
  type UnifiedCalculation,
  type UnifiedDataset,
} from "@crypto-founders/curated-data/unified";

const PRODUCTION_DIRECTORY = resolve(process.cwd(), "../..", "data/production");

let datasetPromise: Promise<UnifiedDataset> | undefined;

export function getUnifiedDataset(): Promise<UnifiedDataset> {
  datasetPromise ??= loadUnifiedData(PRODUCTION_DIRECTORY);
  return datasetPromise;
}

export async function getUnifiedRanking(): Promise<UnifiedCalculation[]> {
  return buildUnifiedRanking(await getUnifiedDataset());
}

export async function getUnifiedProjectIds(): Promise<string[]> {
  return (await getUnifiedDataset()).entries.map(({ entryId }) => entryId);
}

export async function getUnifiedCalculation(
  projectId: string,
): Promise<UnifiedCalculation | undefined> {
  return (await getUnifiedRanking()).find(
    ({ entry }) => entry.entryId === projectId,
  );
}
