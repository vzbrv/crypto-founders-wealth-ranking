# Edge Functions

Implemented functions:

- `market-sync`: batched CoinGecko refresh, validated ingestion, provider health, and calculation trigger
- `wallet-sync`: Ethereum native/ERC-20 and Solana native-balance refresh, validated ingestion, provider health, and calculation trigger

Planned functions:

- `provider-health`: fifteen-minute provider status check

`market-sync` accepts authenticated POST requests using the service-role bearer token. It uses only fixed provider and Supabase endpoints, keeps secrets server-side, and persists observations through `ingest_market_sync`.

`wallet-sync` uses the same authentication boundary. It reads `EVM_ETHEREUM_RPC_URL` and `SOLANA_RPC_URL` only on the server, batches Ethereum ERC-20 reads with Multicall, reads Solana balances at finalized slots, and persists append-only observations through `ingest_wallet_sync`. Solana falls back to the public mainnet RPC endpoint when `SOLANA_RPC_URL` is unset.
