# Architecture

## Phase 0 boundary

The repository is a pnpm/Turborepo monorepo with a statically exported Next.js public app and focused TypeScript packages. Phase 0 deliberately implements no domain data, database schema, provider calls, auth, admin UI, or write endpoints.

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

## Planned Supabase model

Tables: `projects`, `founding_units`, `founding_unit_members`, `assets`, `asset_price_snapshots`, `wallets`, `wallet_balance_snapshots`, `founder_asset_allocations`, `funding_rounds`, `calculation_runs`, `founder_wealth_results`, `founder_wealth_history`, `sources`, `claim_sources`, `ingestion_runs`, and `provider_health`.

Public read views: `public_leaderboard`, `public_founder_profile`, `public_project_profile`, `public_methodology_summary`, and `public_provider_status`.

The names above are design targets, not Phase 0 migrations. Schema, keys, indexes, constraints, policies, and synthetic fixtures start only in their approved implementation phase.

## Repository map

See `AGENTS.md` for package ownership and required engineering workflow.
