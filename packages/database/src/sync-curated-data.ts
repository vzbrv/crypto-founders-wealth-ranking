import {
  loadProductionCuratedData,
  loadProductionUnifiedData,
} from "@crypto-founders/curated-data";
import postgres from "postgres";

import {
  createCuratedImportStatements,
  createUnifiedRankingImportStatements,
  summarizeCuratedImport,
} from "./curated-import.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const curatedDataDirectory = process.env.CURATED_DATA_DIR;
if (!curatedDataDirectory) throw new Error("CURATED_DATA_DIR is required");
const bundle = await loadProductionCuratedData(curatedDataDirectory);
const unifiedDataset = await loadProductionUnifiedData(curatedDataDirectory);
const statements = [
  ...createCuratedImportStatements(bundle),
  ...createUnifiedRankingImportStatements(unifiedDataset),
];
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await sql.begin(async (transaction) => {
    for (const query of statements) {
      await transaction.unsafe(query.text, [...query.values]);
    }
  });
  console.log(
    `Curated and unified data synchronized: ${JSON.stringify({
      ...summarizeCuratedImport(bundle),
      unifiedRankingEntries: unifiedDataset.entries.length,
    })}`,
  );
} finally {
  await sql.end();
}
