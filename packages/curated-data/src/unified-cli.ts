import path from "node:path";

import { loadUnifiedData, validateUnifiedDataset } from "./unified.js";

const directory = process.env.UNIFIED_DATA_DIR
  ? path.resolve(process.env.UNIFIED_DATA_DIR)
  : path.resolve(process.cwd(), "../..", "data/research");

const dataset = await loadUnifiedData(directory);
const errors = validateUnifiedDataset(dataset);

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(
    `Unified dataset valid: ${dataset.entries.length} ranked entries, ${dataset.sources.length} sources, snapshot ${dataset.snapshotDate}`,
  );
}
