# ADR 0011: Separate canonical and live scores

Status: Accepted

## Decision

Persist validated canonical scores and label later live overlays as provisional.
The public ranking may subscribe to supported Coinbase USD pairs using the
`ticker_batch` and `heartbeats` channels. A live price is accepted only when it
is within 20% of the canonical observation. Accepted prices update a
presentation-only estimate; canonical scores and ranks remain unchanged.

Live ordering is recalculated at most every 10 seconds and can be paused. A
disconnect keeps the last accepted value, marks it stale after 30 seconds, and
reconnects with exponential backoff. Missing or rejected prices fall back to the
canonical presentation rather than zero.

## Consequence

Live data cannot silently replace validated results; both carry distinct
freshness. This client-side overlay is intentionally not persisted.
