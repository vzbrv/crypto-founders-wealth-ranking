import { loadProductionCuratedData } from "./index.js";
import { loadProductionUnifiedData } from "./unified.js";

try {
  const data = await loadProductionCuratedData(process.env.CURATED_DATA_DIR);
  const unified = await loadProductionUnifiedData(
    process.env.CURATED_DATA_DIR!,
  );
  const count = Object.values(data).reduce(
    (total, records) => total + records.length,
    0,
  );
  console.log(
    `Production curated data valid: ${count} normalized records and ${unified.entries.length} unified provisional entries.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
