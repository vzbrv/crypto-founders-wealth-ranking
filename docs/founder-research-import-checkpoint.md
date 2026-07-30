# Founder Research Import Checkpoint

Branch: `codex/import-founder-research-handoff`

This is an incomplete implementation checkpoint. The research importer and
calculation safeguards are implemented; UI integration, full validation, and
the final draft pull request remain.

## Completed

- Copied the handoff CSV/workbook files into `data/research/`.
- Added an idempotent, server-side research loader keyed by `project_id`.
- Imported and validated 30 candidates, 32 wallet-evidence rows, 20 capital
  records, and 64 sources.
- Preserved blank values as `null`; explicit researched zero remains distinct.
- Added duplicate project/wallet rejection and source-reference validation.
- Verified provisional formulas and calculated gross/canonical ranks.
- Enforced canonical gating on complete gross, founder-holdings, and capital
  statuses. Dogecoin and Litecoin are the only canonical-ready snapshot rows.
- Classified wallet evidence without publishing unresolved, unsupported,
  low-confidence, disputed, rumored, treasury, or excluded records.
- Added calculation guards for ineligible wallet attribution and tokens that
  are outside circulating supply.
- Added importer and calculation tests.

## Verified at checkpoint

```text
pnpm --filter @crypto-founders/curated-data test
2 files passed, 25 tests passed

pnpm --filter @crypto-founders/calculations test
2 files passed, 52 tests passed
```

## Next work

1. Add the research universe to the existing dashboard, project pages, source
   registry, and sitemap without treating snapshot values as live production
   observations.
2. Link gross, excluded holdings, capital, and wallet attribution values to
   their specific evidence.
3. Show provisional versus canonical values, statuses, timestamps, and exact
   missing evidence.
4. Document provider/chain limitations and all unresolved manual inputs.
5. Run format, lint, typecheck, all tests, production-data/database validation,
   build, E2E/smoke checks, and static-output synthetic-data isolation checks.
6. Commit the completed changes, push, and open a draft pull request. Do not
   deploy, merge, or mark it ready.

No database migration has been added. The imported research layer remains
curated, server-only build data unless later validation proves persistence is
required.
