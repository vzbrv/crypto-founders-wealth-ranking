# Releasing

## Version contracts

- Product release: Semantic Versioning, currently `1.0.0`.
- Calculation contract: stored with each published snapshot, currently `unified-v1`.
- Data contract: production dataset schema version plus its immutable snapshot timestamps and source IDs.
- Methodology contract: the formulas and evidence gates in `docs/methodology.md`; semantic changes require a new calculation version and changelog entry.

## Release checklist

1. Update package versions and `CHANGELOG.md`.
2. Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm audit --prod --audit-level high`, and `pnpm test:e2e`.
3. Confirm production data validation uses `CURATED_DATA_DIR=data/production`.
4. Verify forward-only migrations and register every expected migration version.
5. Build with `pnpm build:web:production` using the protected production environment.
6. Verify the deployed commit, canonical URL, public status views, immutable snapshot, and smoke tests.
7. Create a signed or annotated `vX.Y.Z` tag and GitHub release from the changelog. Do not release if the live data outcome is unverified.
