import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  curatedDataBundleSchema,
  type CuratedDataBundle,
} from "@crypto-founders/schemas";

export const curatedDataFiles = {
  projects: "projects.json",
  foundingUnits: "founding-units.json",
  assets: "assets.json",
  sources: "sources.json",
  wallets: "tracked-wallets.json",
  fundingRounds: "funding-rounds.json",
  recordSources: "record-sources.json",
} as const;

export const defaultDataDirectory = fileURLToPath(
  new URL("../../../data/", import.meta.url),
);

export class CuratedDataValidationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      `Curated data validation failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
    );
    this.name = "CuratedDataValidationError";
  }
}

export function validateCuratedData(input: unknown): CuratedDataBundle {
  const result = curatedDataBundleSchema.safeParse(input);
  if (result.success) return result.data;

  throw new CuratedDataValidationError(
    result.error.issues.map((issue) => {
      const location = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${location}${issue.message}`;
    }),
  );
}

export async function loadCuratedData(
  dataDirectory = defaultDataDirectory,
): Promise<CuratedDataBundle> {
  const entries = await Promise.all(
    Object.entries(curatedDataFiles).map(async ([key, fileName]) => {
      const url = new URL(
        fileName,
        `file://${dataDirectory.replace(/\/$/, "")}/`,
      );
      let value: unknown;
      try {
        value = JSON.parse(await readFile(url, "utf8"));
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new CuratedDataValidationError([`${fileName}: ${detail}`]);
      }
      return [key, value] as const;
    }),
  );

  return validateCuratedData(Object.fromEntries(entries));
}
