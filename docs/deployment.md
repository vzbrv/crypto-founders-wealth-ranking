# Production deployment

The web app is a Next.js static export. Supabase provides PostgreSQL, read-only public REST access, Cron, and Edge Functions. Deployment is intentionally manual.

## Supabase

Create a hosted project, install the Supabase CLI, then run from the repository root:

```bash
export SUPABASE_PROJECT_REF="..."
export SUPABASE_DB_PASSWORD="..."
supabase login
supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"
supabase db push --linked --password "$SUPABASE_DB_PASSWORD"
```

Do not pass `--include-seed`. `supabase/seed.sql` is a production-safe no-op; synthetic fixtures live only in `supabase/tests/seed.synthetic.sql`.

Create one high-entropy `CRON_SECRET`. Set it both in Edge Function secrets and Vault, then deploy:

```bash
supabase secrets set --project-ref "$SUPABASE_PROJECT_REF" \
  CRON_SECRET="$CRON_SECRET" \
  EVM_ETHEREUM_RPC_URL="$EVM_ETHEREUM_RPC_URL" \
  SOLANA_RPC_URL="$SOLANA_RPC_URL" \
  COINGECKO_DEMO_API_KEY="$COINGECKO_DEMO_API_KEY"

psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 \
  --set=project_url="$SUPABASE_URL" \
  --set=cron_secret="$CRON_SECRET" \
  --file supabase/scripts/configure-vault.sql

for function_name in sync-market-data sync-wallet-balances calculate-rankings provider-health; do
  supabase functions deploy "$function_name" \
    --project-ref "$SUPABASE_PROJECT_REF" --no-verify-jwt
done
```

Functions deliberately disable platform JWT verification because Supabase Cron authenticates with the server-only `x-cron-secret` header. Never expose `CRON_SECRET` to the browser.

## Curated production data

Populate `data/production` only with researched, source-backed records. The production marker and loader reject the repository's synthetic fixture directory.

```bash
CURATED_DATA_DIR=data/production pnpm validate:production-data
DATABASE_URL="$DATABASE_URL" CURATED_DATA_DIR=data/production pnpm sync:curated-data
```

The sync is transactional and idempotent: stable record IDs are upserted and rerunning the command does not duplicate rows.

## GitHub Actions

The manually dispatched `deploy-supabase.yml` workflow validates, tests, builds, applies migrations, configures secrets, deploys all four functions, and synchronizes production data. The separate `Verify production` workflow is read-only except for its deliberate anonymous-write rejection check.

Required GitHub production-environment secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `PUBLIC_SITE_URL`
- `DATABASE_URL` (direct PostgreSQL connection)
- `CRON_SECRET`
- `EVM_ETHEREUM_RPC_URL`
- `SOLANA_RPC_URL`
- `COINGECKO_DEMO_API_KEY` (may be empty when unused)

The provider-smoke workflow separately uses repository variable `NEXT_PUBLIC_SUPABASE_URL` and secret `SUPABASE_PUBLISHABLE_KEY`.

## Verification

After Supabase and Cloudflare are live, manually dispatch `Verify production`. It uses the protected `production` environment and writes HTTP and PostgreSQL results to the job summary. Missing configuration is identified by variable name only; secret values, headers, and connection strings must never be logged.

For a local equivalent, run both verification commands without shell tracing:

```bash
PUBLIC_SITE_URL="$PUBLIC_SITE_URL" \
SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_PUBLISHABLE_KEY="$SUPABASE_PUBLISHABLE_KEY" \
CRON_SECRET="$CRON_SECRET" \
pnpm smoke:production

DATABASE_URL="$DATABASE_URL" pnpm verify:production-database
```

The checks cover all public REST views, write/read access boundaries, provider health, static site routes, migration history, active Cron schedules, recent Cron runs, and public view existence.

See [Cloudflare Pages](cloudflare-pages.md) and the [production checklist](production-checklist.md).
