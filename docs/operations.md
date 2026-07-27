# Operations

Phase 0 has no jobs or providers. The approved production schedule is:

| Job                    | Intended cadence    | Role                                                   |
| ---------------------- | ------------------- | ------------------------------------------------------ |
| `sync-market-data`     | Every 5 minutes     | Refresh asset prices and supply inputs                 |
| `sync-wallet-balances` | Every 5-15 minutes  | Refresh public-chain balances within provider quotas   |
| `calculate-rankings`   | Internal dependency | Recompute canonical results after successful ingestion |
| `provider-health`      | Every 15 minutes    | Record provider freshness and failures                 |

Supabase Cron invokes Edge Functions; GitHub Actions does not provide the recurring five-minute scheduler. Exact wallet cadence remains provider-specific.

## Freshness and retention

- Show a stale-data banner when freshness exceeds 20 minutes.
- Retain five-minute history for 30 days, hourly rollups for one year, and daily rollups indefinitely.
- Run nightly rollup and cleanup jobs.
- Keep the last canonical value during an outage; never fabricate a replacement.

Implementation phases must additionally define:

- separate refresh schedules for market, chain, curated, and canonical calculation data;
- bounded retries with backoff and provider-specific rate limiting;
- stale-data behavior that preserves the last canonical value and exposes freshness;
- outage handling with no fabricated fallback values;
- manual replay and reconciliation procedures;
- quota monitoring, structured logs, health checks, and alert thresholds.

Scheduled provider smoke tests must remain separate from deterministic pull-request CI.
