# Curated data workflow

Curated research will be repository-managed, reviewed in pull requests, and validated before build.

The planned repository layout is `data/projects.json`, `data/founding-units.json`, `data/assets.json`, `data/sources.json`, `data/wallets.json`, and `data/funding-rounds.json`. These files are intentionally absent until Phase 1 adds schemas and synthetic fixtures.

Phase 1 will introduce `pnpm validate:data` and `pnpm sync:curated-data`. Validation must run before build or sync. Sync must be idempotent and use privileged credentials only outside the browser.

Phase 1 will add Zod schemas and synthetic example records for projects, founding units, assets, sources, wallets, and funding rounds. Validation will reject missing sources, broken references, and duplicate IDs. No real founder or wealth data belongs in Phase 1.

Future changes must preserve claim-level provenance, distinguish unknown from zero, record review timestamps, and keep evidence confidence separate from monetary calculations.
