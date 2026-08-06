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

    // Guard against the unified ranking document landing as a JSON string
    // instead of a JSON object (seen in production: the jsonb column held
    // a double-encoded string, which readUnifiedDocument in
    // hourly-ranking-snapshot then failed on with a cryptic
    // "Cannot read properties of undefined" error rather than a clear one).
    // Checking inside the transaction means a bad write rolls back instead
    // of landing silently.
    const [check] = await transaction.unsafe<
      { dataset_type: string; entries_count: number }[]
    >(
      `select
         jsonb_typeof(dataset) as dataset_type,
         jsonb_array_length(dataset -> 'entries') as entries_count
       from unified_ranking_documents
       where id = 'current'`,
    );
    if (check?.dataset_type !== "object") {
      throw new Error(
        `unified_ranking_documents.dataset landed as JSON type "${check?.dataset_type}" instead of "object" after sync — refusing to commit. This usually means the value was JSON-encoded twice before being written.`,
      );
    }
    if (check.entries_count !== unifiedDataset.entries.length) {
      throw new Error(
        `unified_ranking_documents.dataset has ${check.entries_count} entries after sync, expected ${unifiedDataset.entries.length} — refusing to commit.`,
      );
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
