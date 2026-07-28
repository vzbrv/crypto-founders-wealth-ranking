# Supabase

This directory contains versioned migrations, Edge Functions, row-level-security policies, seed data, and scheduler configuration.

The migrations define append-only observations, provider health, canonical rankings, anonymous read-only views, wallet and market schedules, a sanitized public provider-status view, and 30-day raw-telemetry retention. Edge Functions implement market and wallet ingestion.

Apply migrations in filename order. Hosted scheduler migrations require Supabase Vault values and are intentionally excluded from portable PGlite tests. See `docs/deployment.md` before applying them and `docs/operations.md` for the active schedules.
