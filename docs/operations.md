# Operations

Phase 4 implements the market job. Later jobs remain planned:

| Job                    | Intended cadence    | Role                                                   |
| ---------------------- | ------------------- | ------------------------------------------------------ |
| `market-sync`          | Every 5 minutes     | Refresh CoinGecko prices and supply, then recalculate  |
| `sync-wallet-balances` | Every 5-15 minutes  | Refresh public-chain balances within provider quotas   |
| `calculate-rankings`   | Internal dependency | Recompute canonical results after successful ingestion |
| `provider-health`      | Every 15 minutes    | Record provider freshness and failures                 |

Supabase Cron invokes `market-sync`; GitHub Actions does not provide the recurring scheduler. The adapter batches up to 200 asset IDs, rate-limits requests, retries with jittered backoff, and opens a circuit breaker after repeated failures. Exact wallet cadence remains provider-specific.

## Market failure behavior

- Each valid provider observation is append-only.
- Invalid, missing, duplicate, future-dated, or stale observations are rejected.
- Failed provider calls record health without replacing the last valid value.
- Rankings recalculate only when at least one new observation is accepted.

Inspect recent state with:

```sql
select * from provider_health order by checked_at desc limit 20;
select * from market_observations where is_valid order by observed_at desc limit 20;
select * from calculation_runs order by started_at desc limit 20;
select jobname, schedule, active from cron.job where jobname = 'market-sync-every-five-minutes';
```

## Freshness and retention

- Show a stale-data banner when freshness exceeds 20 minutes.
- Retain five-minute history for 30 days, hourly rollups for one year, and daily rollups indefinitely.
- Run nightly rollup and cleanup jobs.
- Keep the last canonical value during an outage; never fabricate a replacement.

Later implementation phases must additionally define:

- separate refresh schedules for market, chain, curated, and canonical calculation data;
- bounded retries with backoff and provider-specific rate limiting;
- stale-data behavior that preserves the last canonical value and exposes freshness;
- outage handling with no fabricated fallback values;
- manual replay and reconciliation procedures;
- quota monitoring, structured logs, health checks, and alert thresholds.

Scheduled provider smoke tests remain separate from deterministic pull-request CI. Phase 4 tests inject provider responses and never call CoinGecko live.
