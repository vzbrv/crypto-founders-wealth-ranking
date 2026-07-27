# Crypto Founders Wealth Ranking

Monorepo foundation for a source-backed ranking of crypto founding units by estimated liquid crypto wealth.

Phase 0 contains tooling, architecture decisions, documentation, and a placeholder web app. It contains no production data, provider integrations, authentication, admin system, or write APIs.

The approved production target is all-free: GitHub for source and curated data, a statically exported Next.js site on Cloudflare Pages, and Supabase for PostgreSQL, public read-only REST/Realtime access, Cron, and Edge Functions. Phase 0 records these boundaries without connecting live services.

## Commands

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

`pnpm build` emits the static site to `apps/web/out`.

See [docs/architecture.md](docs/architecture.md) for the repository map and [docs/methodology.md](docs/methodology.md) for the ranking rules.
