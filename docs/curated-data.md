# Curated data workflow

Curated research will be repository-managed, reviewed in pull requests, and validated before build.

The repository layout is `data/projects.json`, `data/founding-units.json`, `data/assets.json`, `data/sources.json`, `data/tracked-wallets.json`, `data/funding-rounds.json`, and `data/record-sources.json`.

Phase 1 provides `pnpm validate:data`; it also runs automatically before every build and in CI. Phase 2 adds idempotent `pnpm sync:curated-data` after the Supabase schema exists. Sync will validate first and use privileged credentials only outside the browser.

Phase 1 includes Zod schemas and synthetic example records for projects, founding units, assets, sources, wallets, funding rounds, and claim-level source links. Validation rejects missing sources, broken references, malformed values, invalid chain addresses, attribution errors, missing primary assets, included funding without USD-at-event, and duplicate IDs. No real founder or wealth data belongs in Phase 1.

Future changes must preserve claim-level provenance, distinguish unknown from zero, record review timestamps, and keep evidence confidence separate from monetary calculations.
