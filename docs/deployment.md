# Deployment

The web build is compatible with static hosting: `pnpm build` writes `apps/web/out`. Phase 4 also provides the `market-sync` Edge Function and its five-minute Supabase Cron migration; connecting production projects remains an operator action.

## Free deployment path

1. GitHub pull-request CI validates formatting, lint, types, unit tests, the static build, browser tests, and dependency audit.
2. Cloudflare Pages builds the repository with `pnpm install --frozen-lockfile && pnpm build` and publishes `apps/web/out`.
3. A gated GitHub Actions deployment applies Supabase migrations, deploys Edge Functions, validates curated data, performs idempotent sync, and runs health checks.

Cloudflare Pages must use the Next.js Static HTML Export preset or equivalent settings. No GitHub Actions job should poll providers every five minutes; recurring jobs belong to Supabase Cron.

Before applying `202607280003_phase_4_market_schedule.sql`, add `project_url` and `service_role_key` to Supabase Vault. Deploy the function with `supabase functions deploy market-sync`, then apply all migrations in order. The Edge runtime supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; `COINGECKO_DEMO_API_KEY` is optional.

Required secret names are documented in `.env.example`. Values must be supplied by the deployment platform and must never be committed.

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may enter the browser bundle. Service-role, provider, cron, database, Supabase deployment, and Cloudflare deployment credentials remain secret.
