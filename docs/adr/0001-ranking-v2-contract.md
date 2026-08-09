# ADR 0001: Ranking v2 production contract

Status: accepted. This document is normative for `ranking_v2`.

## Metric and grain

The ranked unit is an economic project/founding unit. Individuals and teams are
display attributes, not independently ranked rows. The authoritative grain is
`(snapshot_id, economic_project_id)`.

For each feasible state `s`:

```text
circulating_value(s) = sum(normalized_price(asset) * approved_circulating_units(asset))
affiliated_value(s) = sum(normalized_price(asset) * affiliated_circulating_units(asset, s))
value_created_for_others(s) = circulating_value(s) - affiliated_value(s) - qualifying_capital(s)
```

The published lower and upper values are the minimum and maximum over every
feasible joint state. Shared capital, ownership, and canonical backing constraints
must be solved jointly; independent interval maxima are not valid states.

## Time and inputs

Snapshots pin `economic_as_of` and `knowledge_cutoff`. An input is selectable only
when its economic time is at or before `economic_as_of` and its immutable
first-ingestion `known_at` is at or before `knowledge_cutoff`. Corrections and
supersessions are new append-only facts with their own `known_at`.

Price and circulating supply are separate raw observations. Provider-reported
market cap is diagnostic only. Raw facts do not contain methodology decisions.
Snapshots freeze selected inputs and hash their canonical serialization.

## Eligibility and confidence

Known material unresolved ownership or capital cannot be omitted. Defensible
bounds produce a provisional interval; otherwise the project is ineligible.
`confidence_status` is derived from the versioned evidence policy and cannot be
set manually. It is independent from `rank_order_status`.

Rank states are `exact`, `tied`, `overlapping`, `indeterminate`, and
`not_eligible`. Ranks use competition ranking (1, 2, 2, 4). Rank bounds are solved
against feasible cohort states, not independent project intervals.

## Lifecycle and reproducibility

Snapshots move `draft -> validated -> published`. A privileged transaction may
publish only a complete validated cohort and atomically update the single current
pointer. Published snapshots and completed reviews are immutable; invalidations
and superseding reviews are append-only.

Every snapshot pins methodology, confidence policy, engine commit, solver,
configuration, schema, constraint set, canonical serialization, and five input
hashes. `pnpm reproduce:snapshot <snapshot_id>` must reconstruct from frozen
inputs and either reproduce every output hash exactly or report the first
divergence.

Public readers receive only published score/evidence fields and sanitized
rejection messages. Private diagnostics and all mutation remain service-role only.
