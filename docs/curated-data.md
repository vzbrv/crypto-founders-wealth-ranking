# Curated data workflow

Curated research is repository-managed, reviewed in pull requests, and validated before build.

The repository layout is `data/projects.json`, `data/founding-units.json`, `data/assets.json`, `data/sources.json`, `data/tracked-wallets.json`, `data/funding-rounds.json`, and `data/record-sources.json`.

`pnpm validate:data` validates synthetic fixtures. `CURATED_DATA_DIR=data/production pnpm validate:production-data` validates production research. `pnpm sync:curated-data` validates first and uses privileged credentials only outside the browser.

Zod schemas cover projects, founding units, assets, sources, wallets, funding rounds, and claim-level source links. Validation rejects missing evidence, broken references, malformed values, invalid chain addresses, attribution errors, multiple active canonical units without an explicit allocation, incomplete reviews, reviewed-zero records without evidence, and duplicate wallet or funding deductions.

The production and research copies of `unified-ranking.json` additionally verify
formula results, ranks, confidence totals, source references, and the 100-point
component maximum. Validation rejects full ownership-completeness credit when
ownership is `Unknown` and full outside-capital-completeness credit when outside
capital is `Unknown`. Update both copies and the evidence status, notes,
components, and sources together.

Every project has separate wallet and funding reviews. Every wallet and funding event has its own reviewer, timestamp, notes, evidence, and deduplication key. Unknown values stay null. See [schema.md](schema.md).
