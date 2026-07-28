# Edge Functions

Implemented functions:

- `market-sync`: batched CoinGecko refresh, validated ingestion, provider health, and calculation trigger
- `wallet-sync`: viem Ethereum native/ERC-20 refresh, validated ingestion, provider health, and calculation trigger

Planned functions:

- `provider-health`: fifteen-minute provider status check

`market-sync` accepts authenticated POST requests using the service-role bearer token. It uses only fixed provider and Supabase endpoints, keeps secrets server-side, and persists observations through `ingest_market_sync`.

`wallet-sync` uses the same authentication boundary, reads `EVM_ETHEREUM_RPC_URL` only on the server, batches ERC-20 reads with Multicall, and persists append-only observations through `ingest_wallet_sync`.
