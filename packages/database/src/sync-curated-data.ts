import { loadProductionCuratedData } from "@crypto-founders/curated-data";
import postgres from "postgres";

import {
  createCuratedImportStatements,
  summarizeCuratedImport,
} from "./curated-import.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const bundle = await loadProductionCuratedData(process.env.CURATED_DATA_DIR);
const statements = createCuratedImportStatements(bundle);
const sql = postgres(databaseUrl, { max: 1, prepare: false });

try {
  await sql.begin(async (transaction) => {
    for (const query of statements) {
      await transaction.unsafe(query.text, [...query.values]);
    }
  });
  console.log(
    `Curated data synchronized: ${JSON.stringify(summarizeCuratedImport(bundle))}`,
  );
} finally {
  await sql.end();
}
