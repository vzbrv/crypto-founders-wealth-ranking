# Repository guidance

## Scope

This repository produces an evidence-backed crypto founders wealth ranking. Never invent holdings, funding, affiliations, prices, supply, sources, or confidence.

## Repository map

- `apps/web`: public read-only Next.js application
- `packages/calculations`: deterministic Decimal-based calculations
- `packages/curated-data`: reviewed repository-managed research data
- `packages/database`: persistence and migrations
- `packages/market-adapters`: price and supply provider boundaries
- `packages/chain-adapters`: public-chain provider boundaries
- `packages/schemas`: shared validation schemas
- `packages/config`: validated configuration
- `packages/observability`: logging and health primitives
- `supabase`: future migrations, Edge Functions, and scheduler configuration
- `data`: future reviewed JSON source of truth
- `docs`: methodology, operations, security, and ADRs

## Required workflow

1. Preserve source-to-claim traceability.
2. Represent unknown values as unknown, never zero.
3. Use arbitrary-precision Decimal arithmetic for money and token quantities.
4. Validate references and schemas before build or ingestion.
5. Add unit tests for calculations and schema failures.
6. Add integration tests around adapters without relying on live providers in normal CI.
7. Add migrations for every persisted schema change; never mutate production schemas manually.

## Commands

Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before proposing changes. Run `pnpm e2e` for user-facing changes.

## Boundaries

The public app is read-only. Do not add auth, admin routes, public mutation APIs, private keys, or on-chain write capability unless a later approved phase changes the architecture.

The web app must remain statically exportable for Cloudflare Pages. Recurring provider work belongs in Supabase Cron and Edge Functions, not browser code or five-minute GitHub Actions schedules. Anonymous Supabase access is read-only under row-level security.
