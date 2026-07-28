# Edge Functions

Planned functions:

- `sync-market-data`: five-minute market refresh
- `sync-wallet-balances`: provider-aware five-to-fifteen-minute balance refresh
- `calculate-rankings`: internal calculation after successful ingestion
- `provider-health`: fifteen-minute provider status check

Phase 0 contains no executable function or provider call. Functions must use server-side secrets, bounded concurrency, idempotent writes, structured run records, and explicit failure states.
