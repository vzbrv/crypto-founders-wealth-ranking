# Founder Research Import Checkpoint

Branch: `codex/import-founder-research-handoff`

This checkpoint now includes the research importer, calculation safeguards,
static UI integration, and local production validation. Only the final draft
pull request remains.

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
- Added a dated, explicitly unranked research summary to the dashboard.
- Added a static 30-candidate research index and per-project detail pages with
  provisional/canonical values, evidence status, missing inputs, wallet/entity
  evidence, and source links.
- Added the separate 64-source research register, navigation, and sitemap
  entries without changing canonical leaderboard inputs.

## Verified at checkpoint

```text
pnpm validate:research-data
30 candidates, 32 wallet rows, 20 capital records, 64 sources

CURATED_DATA_DIR=data/production pnpm check
9 package checks passed; 79 production records; 45 static pages

PLAYWRIGHT_CHANNEL=chrome pnpm e2e
9 tests passed

Static output inspection
Research index plus 30 detail pages; no synthetic fixture HTML/XML
```

The live HTTP portion of `pnpm smoke:production` requires protected deployment
variables and was not completed locally. No external configuration was changed.

## Snapshot limitations

- Values are fixed to the source CSV snapshot date; there is no live market,
  chain, explorer, or wallet-provider refresh.
- Wallet/entity evidence is curated public research only. It is excluded from
  synchronization and cannot change a published score.
- Partial, missing, and refresh-required inputs remain unresolved manual work.
  Blank deductions stay unknown and never become canonical zeroes.
- Before publication, refresh time-sensitive valuation inputs, recheck every
  source and ownership claim, resolve the candidate's listed missing evidence,
  and rerun the publication gate in `data/research/CODEX_HANDOFF.md`.

## Remaining work

1. Commit the completed changes, push, and open a draft pull request. Do not
   deploy, merge, or mark it ready.

No database migration has been added. The imported research layer remains
curated, server-only build data unless later validation proves persistence is
required.
