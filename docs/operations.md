# Production operations

## Scheduled work

| Job                              | Cadence            | Owner          | Purpose                                                |
| -------------------------------- | ------------------ | -------------- | ------------------------------------------------------ |
| `market-sync-every-five-minutes` | Every 5 minutes    | Supabase Cron  | Ingest CoinGecko observations and recalculate rankings |
| `wallet-sync-every-five-minutes` | Every 5 minutes    | Supabase Cron  | Refresh configured Ethereum and Solana balances        |
| `phase-10-observation-retention` | Daily at 03:17 UTC | Supabase Cron  | Delete raw telemetry older than 30 days                |
| `Provider smoke`                 | Every 15 minutes   | GitHub Actions | Check the sanitized public provider-status view        |

Confirm the database schedule with:

```sql
select jobname, schedule, active
from cron.job
order by jobname;
```

The retention function keeps the newest row for each provider or observed subject even when it is older than 30 days. It removes only raw `market_observations`, `wallet_balance_observations`, and `provider_health` rows; canonical ranking records and curated evidence are not deleted.

## Monitoring and alerts

The public `/status` page reads `public_provider_status`. That view exposes only provider name, check time, status, latency, and derived freshness. Raw diagnostics in `provider_health` remain privileged.

The `Provider smoke` workflow fails when the view is unavailable, empty, stale for more than 20 minutes, or contains a non-healthy provider. Configure:

- repository variable `NEXT_PUBLIC_SUPABASE_URL`;
- repository secret `SUPABASE_PUBLISHABLE_KEY`.

A failed scheduled workflow is the alert. Enable GitHub Actions failure notifications for the operating account. Never replace missing or failed observations with fabricated values; the public product must retain the last valid canonical value and show its freshness.

Privileged investigation queries:

```sql
select * from provider_health order by checked_at desc limit 50;
select * from market_observations where is_valid order by observed_at desc limit 50;
select * from wallet_balance_observations where is_valid order by observed_at desc limit 50;
select * from calculation_runs order by started_at desc limit 20;
```

## Incident response

1. Confirm whether the failure is the provider, Edge Function, database, or monitor configuration.
2. Inspect the latest provider-health row and the corresponding Edge Function logs.
3. Check Supabase Cron history and quotas. Do not repeatedly replay jobs while a provider is rate-limiting.
4. Correct configuration or provider access, then invoke the affected sync once.
5. Confirm a new healthy status, a valid observation, and a successful calculation run.
6. Record the incident window, affected providers, stale-data duration, and remediation.

If only monitoring is broken, keep the product available and report status as unknown. If data validity is uncertain, stop the affected ingestion path and preserve the last verified canonical result.

## Error reporting

The browser error boundary sends a bounded, redacted JSON report only when `NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT` is configured. Reports omit credentials and stack traces. The receiving service must enforce rate limits, restrict retention and access, and avoid storing request headers or IP addresses unless explicitly required and disclosed. Leaving the variable empty disables remote client reporting while preserving the local recovery UI.

## Recovery and rollback

- Application rollback: redeploy the previous verified Git commit.
- Database rollback: migrations are forward-only. Apply a reviewed corrective migration; do not edit an applied migration.
- Scheduler rollback: disable the affected `cron.job` before applying a corrective migration.
- Data recovery: use Supabase backups appropriate to the selected plan and test restoration before an incident.

Run `select public.run_observation_retention();` manually only with the service role and only after confirming the intended 30-day cutoff.
