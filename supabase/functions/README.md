# Edge Functions

Implemented functions:

- `market-sync`: batched CoinGecko refresh, validated ingestion, provider health, and calculation trigger

Planned functions:

- `sync-wallet-balances`: provider-aware five-to-fifteen-minute balance refresh
- `provider-health`: fifteen-minute provider status check

`market-sync` accepts authenticated POST requests using the service-role bearer token. It uses only fixed provider and Supabase endpoints, keeps secrets server-side, and persists observations through `ingest_market_sync`.
