# Architecture

## Architecture boundary

The repository is a pnpm/Turborepo monorepo with a statically exported Next.js public app, focused TypeScript packages, and Supabase persistence/functions. Through Phase 10 it implements curated-data validation, Decimal calculations, the core database schema, market and wallet ingestion, calculation transparency, public ranking routes, monitoring, retention, SEO, and production runbooks. Auth, admin UI, Bitcoin and other non-EVM providers, and production curated data remain outside the current boundary.

## Approved all-free topology

| Responsibility                         | Platform                                | Boundary                                                         |
| -------------------------------------- | --------------------------------------- | ---------------------------------------------------------------- |
| Source, curated JSON, review, CI       | GitHub                                  | Repository is the source of truth for reviewed research          |
| Public web app                         | Cloudflare Pages                        | Deploy only `apps/web/out`; no Next.js server runtime            |
| Canonical persistence and public reads | Supabase PostgreSQL, REST, and Realtime | Browser receives public, read-only data under row-level security |
| Scheduled ingestion and calculations   | Supabase Cron and Edge Functions        | Secrets and privileged writes remain server-side                 |

No authentication or admin application is planned. Curated changes enter through pull requests and an idempotent sync job.

## Data layers

1. Live market data: price and circulating supply through replaceable market adapters.
2. Public on-chain data: balances and holdings through chain adapters.
3. Curated research: affiliations, funding events, inclusion fractions, and claim-level sources stored in Git.

Calculations consume validated normalized inputs. The UI consumes persisted canonical results and may later overlay provisional live values without silently replacing the canonical score.

## Supabase model

Tables: `projects`, `founding_units`, `founding_unit_members`, `assets`, `asset_price_snapshots`, `wallets`, `wallet_balance_snapshots`, `founder_asset_allocations`, `funding_rounds`, `calculation_runs`, `founder_wealth_results`, `founder_wealth_history`, `sources`, `claim_sources`, `ingestion_runs`, and `provider_health`.

Public read views: `public_leaderboard`, `public_founder_profile`, `public_project_profile`, `public_methodology_summary`, and `public_provider_status`.

The versioned implementation is authoritative in `supabase/migrations`; some conceptual names above map to normalized tables and views there.

## Repository map

See `AGENTS.md` for package ownership and required engineering workflow.
