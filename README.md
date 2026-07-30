# Crypto Founders Wealth Ranking

Monorepo foundation for a source-backed ranking of crypto founding units by estimated liquid crypto wealth.

Phases 0–10 contain the complete specified product: curated-data schemas, Decimal calculation engine, Supabase persistence, market and wallet ingestion, calculation transparency, public product routes, provider status, retention, error handling, SEO, accessibility, and production runbooks. The repository includes a reviewed production research set; it does not contain authentication or an admin system.

The approved production target is all-free: GitHub for source and curated data, a statically exported Next.js site on Cloudflare Pages, and Supabase for PostgreSQL, public read-only REST/Realtime access, Cron, and Edge Functions.

## Commands

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm validate:database
pnpm build
pnpm test:e2e
```

`pnpm build` emits the static site to `apps/web/out`.

See [docs/architecture.md](docs/architecture.md) for the repository map, [docs/methodology.md](docs/methodology.md) for ranking rules, [docs/schema.md](docs/schema.md) for review and public-view fields, [docs/deployment.md](docs/deployment.md) for Supabase releases, [docs/cloudflare-pages.md](docs/cloudflare-pages.md) for exact web hosting settings, and [docs/production-checklist.md](docs/production-checklist.md) for human deployment steps.
