# Production deployment checklist

## Before deployment

- [ ] Replace empty `data/production` arrays with reviewed, source-backed records; do not copy synthetic fixtures.
- [ ] Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm validate:data`, `pnpm validate:production-data`, `pnpm validate:database`, and `pnpm build`.
- [ ] Confirm `apps/web/out/project/synthetic-horizon` does not exist. Production builds must use only reviewed `data/production` records.
- [ ] Create the hosted Supabase project and record its project ref, URL, database password, direct database URL, and publishable key.
- [ ] Generate one high-entropy `CRON_SECRET`; store it only in Supabase Edge Function secrets, Supabase Vault, and GitHub's protected production environment.
- [ ] Configure reviewed Ethereum, Solana, and optional CoinGecko provider credentials.
- [ ] Add all GitHub production-environment secrets listed in `docs/deployment.md` and require environment approval.

## Deploy

- [ ] Manually dispatch `Deploy Supabase production` and review every job step.
- [ ] Confirm all migrations appear in Supabase migration history.
- [ ] Confirm four Edge Functions are deployed: `sync-market-data`, `sync-wallet-balances`, `calculate-rankings`, `provider-health`.
- [ ] Confirm Cron jobs exist and send only the Vault-backed `x-cron-secret` header.
- [ ] Create Cloudflare Pages with the exact settings in `docs/cloudflare-pages.md`.

## After deployment

- [ ] Manually dispatch `Verify production` and approve its protected `production` environment.
- [ ] Review the workflow summary; both HTTP and PostgreSQL verification must pass.
- [ ] Confirm anonymous reads work for all four public REST views and anonymous writes and raw `provider_health` reads fail.
- [ ] Confirm all expected migrations, four active Cron jobs, recent Cron executions, and required public views are reported.
- [ ] Confirm `/status` reports degraded/stale data rather than hiding failed refreshes.
- [ ] Check structured Edge Function logs for each scheduled run; no credential or request-header values should appear.
- [ ] Confirm canonical, sitemap, robots, manifest, and Open Graph URLs use the production site URL.
