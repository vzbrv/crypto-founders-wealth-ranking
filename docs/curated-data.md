# Curated data workflow

Curated research is repository-managed, reviewed in pull requests, and validated before build.

The repository layout is `data/projects.json`, `data/founding-units.json`, `data/assets.json`, `data/sources.json`, `data/tracked-wallets.json`, `data/funding-rounds.json`, and `data/record-sources.json`.

`pnpm validate:data` validates synthetic fixtures. `CURATED_DATA_DIR=data/production pnpm validate:production-data` validates production research. `pnpm sync:curated-data` validates first and uses privileged credentials only outside the browser.

Zod schemas cover projects, founding units, assets, sources, wallets, funding rounds, and claim-level source links. Validation rejects missing evidence, broken references, malformed values, invalid chain addresses, attribution errors, multiple active canonical units without an explicit allocation, incomplete reviews, reviewed-zero records without evidence, and duplicate wallet or funding deductions.

Every project has separate wallet and funding reviews. Every wallet and funding event has its own reviewer, timestamp, notes, evidence, and deduplication key. Unknown values stay null. See [schema.md](schema.md).
