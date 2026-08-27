# Crypto Founders Estimated Value Created Ranking

Monorepo foundation for a source-backed ranking of popular crypto founders and documented founding teams by estimated value created for outside holders or shareholders. The primary metric is not personal net worth, liquid wealth, or wallet balance.

Phases 0–10 contain the complete specified product: curated-data schemas, Decimal calculation engine, Supabase persistence, market and wallet ingestion, calculation transparency, public product routes, provider status, retention, error handling, SEO, accessibility, and production runbooks. The repository includes a reviewed production research set; it does not contain authentication or an admin system.

The approved production target is all-free: GitHub for source and curated data, a statically exported Next.js site on Cloudflare Pages, and Supabase for PostgreSQL, public read-only REST/Realtime access, Cron, and Edge Functions.

## Naming

The repository slug is retained for link stability. The public product name is Crypto Founders Estimated Value Created Ranking; it does not rank personal wealth.

## Evidence status

The bundled July 30, 2026 unified dataset is provisional: 18 of 20 entries are
upper estimates, 16 have unknown affiliated ownership, 16 have unknown outside
capital, and only 2 are High confidence. Unknown deductions remain null and
unapplied; they are not zero. Research should resolve ownership and financing
evidence for the highest-ranked entries before increasing market-price update
frequency. See the [production data notes](data/production/README.md) and
[methodology](docs/methodology.md).

## Commands

```bash
pnpm install
pnpm e2e:install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm validate:database
pnpm build
pnpm test:e2e
```

`pnpm build` emits the static site to `apps/web/out`.

Production hosting must use `pnpm build:web:production`. That command fails before compilation when the public Supabase URL, publishable key, or canonical site URL is missing. The normal `pnpm build` remains usable for local development and renders an explicit timestamped bundled-data fallback.

See [docs/architecture.md](docs/architecture.md) for the repository map, [docs/methodology.md](docs/methodology.md) for every ranking formula, live-rank rule, evidence gate, and individual/team attribution rule, [docs/schema.md](docs/schema.md) for review and public-view fields, [docs/deployment.md](docs/deployment.md) for Supabase releases, [docs/cloudflare-pages.md](docs/cloudflare-pages.md) for exact web hosting settings, and [docs/production-checklist.md](docs/production-checklist.md) for human deployment steps.

## Licensing

Source code is licensed under [Apache License 2.0](LICENSE). Data, research, and documentation are licensed under [Creative Commons Attribution 4.0 International](LICENSE-DATA-DOCS.md). Third-party sources retain their own rights; attribution is not an endorsement.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md), and the [release guide](docs/releasing.md) before proposing or publishing changes.
