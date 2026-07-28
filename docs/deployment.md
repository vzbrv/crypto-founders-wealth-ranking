# Production deployment

The public application is a static Next.js export. `pnpm build` writes `apps/web/out`; Supabase hosts persistence, read-only public data, Edge Functions, and recurring jobs.

## Prerequisites

- Node.js 22 and pnpm 11.9.0
- a Supabase project with CLI access
- a static web host such as Cloudflare Pages
- the GitHub repository with Actions enabled

Set deployment values from `.env.example`. Only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SITE_URL`, and the optional error-reporting endpoint may enter the browser bundle. Service-role, provider, database, Supabase, and hosting credentials remain secret.

Before schedule migrations, store `project_url` and `service_role_key` in Supabase Vault. Configure `EVM_ETHEREUM_RPC_URL`; configure `SOLANA_RPC_URL` rather than relying on the public endpoint. `COINGECKO_DEMO_API_KEY` is optional.

## Release order

1. Run `pnpm install --frozen-lockfile` and `pnpm check`.
2. Apply Supabase migrations in filename order. This creates the sanitized provider-status view before the site uses it.
3. Deploy Edge Functions:

   ```bash
   supabase functions deploy market-sync
   supabase functions deploy wallet-sync
   ```

4. Validate and synchronize curated data with `pnpm validate:data` and `pnpm sync:curated-data`.
5. Run one idempotent market and wallet sync; confirm provider health and calculation output.
6. Build with `pnpm build` and publish `apps/web/out` using the Next.js Static HTML Export preset.
7. Configure GitHub variable `NEXT_PUBLIC_SUPABASE_URL` and secret `SUPABASE_PUBLISHABLE_KEY` for the provider monitor.

## Post-deployment checks

- `/`, `/methodology`, `/sources`, and one project route load without client errors.
- `/status` displays current provider data or an explicit unknown state.
- `/robots.txt`, `/sitemap.xml`, `/manifest.webmanifest`, and `/opengraph-image` respond successfully.
- canonical and Open Graph URLs use the production `NEXT_PUBLIC_SITE_URL`.
- anonymous users can read published ranking views and `public_provider_status`, but cannot read raw `provider_health` diagnostics or write data.
- scheduled sync, retention, and provider-monitor jobs are active.

Do not release when migrations, deterministic tests, the static build, or anonymous-access checks fail. See [operations.md](operations.md) for incident response and rollback.
