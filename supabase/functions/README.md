# Edge Functions

Deployable functions:

- `sync-market-data`: refreshes validated market observations
- `sync-wallet-balances`: refreshes Ethereum and Solana wallet observations
- `calculate-rankings`: runs the scheduled ranking calculation
- `provider-health`: returns the current sanitized provider state

All accept POST only and require `x-cron-secret` to equal the server-side `CRON_SECRET`. Supabase Cron reads the same value from Vault. Functions use the built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; provider credentials remain server-side.

Logs are one-line JSON with level, function, event, status/counts, and duration. They never log headers, keys, URLs containing credentials, or raw provider errors.

When a market or wallet refresh fails, the function records a sanitized failed provider-health result and leaves the last successful observations and rankings intact. Public views expose `is_stale` and `stale_reason` so the frontend can show degraded data.
