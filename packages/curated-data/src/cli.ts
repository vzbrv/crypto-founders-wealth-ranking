import { loadCuratedData } from "./index.js";

try {
  const data = await loadCuratedData();
  const recordCount =
    data.projects.length +
    data.foundingUnits.length +
    data.assets.length +
    data.sources.length +
    data.wallets.length +
    data.fundingRounds.length +
    data.recordSources.length;
  console.log(
    `Curated data valid: ${recordCount} synthetic records across 7 files.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
