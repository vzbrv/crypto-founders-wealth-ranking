import {
  loadProductionCuratedData,
  loadProductionUnifiedData,
} from "@crypto-founders/curated-data";
import postgres from "postgres";

import {
  createCuratedImportStatements,
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
const statements = createCuratedImportStatements(bundle);
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await sql.begin(async (transaction) => {
    for (const query of statements) {
      await transaction.unsafe(query.text, [...query.values]);
    }

    // The unified ranking document is written separately from the generic
    // statement loop above, using postgres.js's own sql.json() helper
    // (which tags the parameter with the jsonb OID directly, bypassing its
    // string-vs-object type inference) rather than a manually
    // JSON.stringify()'d string plus a ::jsonb cast. In production, that
    // manual-stringify-plus-cast combination was landing this column as a
    // JSON *string* instead of a JSON object — confirmed live (not just
    // suspected) by the guard below, which caught it and rolled back rather
    // than committing corrupted data. sql.json() is postgres.js's
    // documented, unambiguous way to send a JSON/JSONB parameter, so this
    // removes the guesswork instead of trying to out-clever the inference.
    //
    // Note: the PGlite-backed test suite (database.test.ts) exercises
    // createUnifiedRankingImportStatements's manual-stringify approach
    // instead, since PGlite's driver has no equivalent sql.json() helper
    // and (confirmed separately) does not reproduce this issue either way.
    // This block — the actual code that runs in production — is instead
    // covered by the write-then-verify guard immediately below, every time
    // it runs.
    await transaction.unsafe(
      `insert into unified_ranking_documents
         (id, snapshot_date, methodology_version, dataset)
       values ('current', $1, $2, $3)
       on conflict (id) do update set
         snapshot_date = excluded.snapshot_date,
         methodology_version = excluded.methodology_version,
         dataset = excluded.dataset,
         updated_at = now()`,
      [
        unifiedDataset.snapshotDate,
        unifiedDataset.methodologyVersion,
        transaction.json(unifiedDataset as unknown as postgres.JSONValue),
      ],
    );

    // Guard against the unified ranking document landing as a JSON string
    // instead of a JSON object. Checking inside the transaction means a bad
    // write rolls back instead of landing silently.
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
