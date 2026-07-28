import { loadProductionCuratedData } from "./index.js";

try {
  const data = await loadProductionCuratedData(process.env.CURATED_DATA_DIR);
  const count = Object.values(data).reduce(
    (total, records) => total + records.length,
    0,
  );
  console.log(`Production curated data valid: ${count} reviewed records.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
