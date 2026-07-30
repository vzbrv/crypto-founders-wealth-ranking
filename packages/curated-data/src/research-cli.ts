import { loadResearchData } from "./research.js";

const data = process.env.RESEARCH_DATA_DIR
  ? await loadResearchData(process.env.RESEARCH_DATA_DIR)
  : await loadResearchData();
const canonical = data.candidates.filter(
  (candidate) => candidate.publicationStatus === "Ready",
);

console.log(
  JSON.stringify(
    {
      candidates: data.candidates.length,
      wallets: data.wallets.length,
      capitalRecords: data.capitalRecords.length,
      sources: data.sources.length,
      canonicalProjects: canonical.map((candidate) => candidate.projectId),
    },
    null,
    2,
  ),
);
