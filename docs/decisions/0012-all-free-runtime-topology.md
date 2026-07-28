# ADR 0012: All-free runtime topology

## Status

Accepted for the initial production architecture.

## Decision

Use GitHub for source and curated-data review, Cloudflare Pages for the statically exported Next.js app, and Supabase for PostgreSQL, public read-only REST/Realtime access, Cron, and Edge Functions.

No authentication or admin system will be added. Browser access is anonymous and read-only under row-level security. Secrets and privileged writes remain in Edge Functions or gated GitHub Actions jobs.

## Consequences

The web app cannot depend on Next.js server features. Provider schedules and data retention must be designed within free-service constraints, which require validation against current official limits before activation. Platform adapters and documented export paths reduce migration cost if those constraints change.
