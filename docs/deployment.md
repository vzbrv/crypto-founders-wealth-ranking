# Deployment

Production deployment is deferred. Phase 0 only makes the web build compatible with static hosting: `pnpm build` writes `apps/web/out`.

## Planned free deployment path

1. GitHub pull-request CI validates formatting, lint, types, unit tests, the static build, browser tests, and dependency audit.
2. Cloudflare Pages builds the repository with `pnpm install --frozen-lockfile && pnpm build` and publishes `apps/web/out`.
3. A gated GitHub Actions deployment applies Supabase migrations, deploys Edge Functions, validates curated data, performs idempotent sync, and runs health checks.

Cloudflare Pages must use the Next.js Static HTML Export preset or equivalent settings. No GitHub Actions job should poll providers every five minutes; recurring jobs belong to Supabase Cron.

The deployment workflow is intentionally not active in Phase 0 because no Supabase or Cloudflare project, target identifiers, schemas, functions, or credentials exist yet.

Required secret names are documented in `.env.example`. Values must be supplied by the deployment platform and must never be committed. Phase 0 does not consume them.

Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may enter the browser bundle. Service-role, provider, cron, database, Supabase deployment, and Cloudflare deployment credentials remain secret.
