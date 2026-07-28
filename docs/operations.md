# Operations

Phase 7 implements the market and EVM wallet jobs:

| Job                  | Intended cadence    | Role                                                      |
| -------------------- | ------------------- | --------------------------------------------------------- |
| `market-sync`        | Every 5 minutes     | Refresh CoinGecko prices and supply, then recalculate     |
| `wallet-sync`        | Every 5 minutes     | Refresh Ethereum native/ERC-20 balances, then recalculate |
| `calculate-rankings` | Internal dependency | Recompute canonical results after successful ingestion    |
| `provider-health`    | Every 15 minutes    | Record provider freshness and failures                    |

Supabase Cron invokes `market-sync` and `wallet-sync`; GitHub Actions does not provide the recurring scheduler. Market ingestion batches up to 200 asset IDs. EVM ingestion pins reads to one latest block, batches ERC-20 calls with Multicall, and retries bounded provider failures.

## Market failure behavior

- Each valid provider observation is append-only.
- Invalid, missing, duplicate, future-dated, or stale observations are rejected.
- Failed provider calls record health without replacing the last valid value.
- Rankings recalculate only when at least one new observation is accepted.

Inspect recent state with:

```sql
select * from provider_health order by checked_at desc limit 20;
select * from market_observations where is_valid order by observed_at desc limit 20;
select * from wallet_balance_observations where is_valid order by observed_at desc limit 20;
select * from calculation_runs order by started_at desc limit 20;
select jobname, schedule, active from cron.job where jobname in ('market-sync-every-five-minutes', 'wallet-sync-every-five-minutes');
```

## Freshness and retention

- Show a stale-data banner when freshness exceeds 20 minutes.
- Retain five-minute history for 30 days, hourly rollups for one year, and daily rollups indefinitely.
- Run nightly rollup and cleanup jobs.
- Keep the last canonical value during an outage; never fabricate a replacement.

Later implementation phases must additionally define:

- separate refresh schedules for curated and canonical calculation data;
- provider-specific rate limiting;
- stale-data behavior that preserves the last canonical value and exposes freshness;
- outage handling with no fabricated fallback values;
- manual replay and reconciliation procedures;
- quota monitoring, structured logs, health checks, and alert thresholds.

Scheduled provider smoke tests remain separate from deterministic pull-request CI. Tests inject provider responses and never call CoinGecko or Ethereum RPC endpoints live.
