# Review and public schema

## Curated review fields

Projects contain independent `walletReview` and `fundingReview` records. Wallets and funding events contain `reviewStatus`, `reviewer`, `reviewedAt`, `reviewNotes`, `evidenceSourceIds`, and a stable `deduplicationKey`. Wallet balances also record whether the balance is circulating. Funding `amountUsdAtEvent` is nullable until evidence resolves it.

Statuses are `not_reviewed`, `in_progress`, `approved_sufficient`, and `reviewed_insufficient`. Completed reviews require reviewer, timestamp, notes, and evidence. A reviewed zero uses the same requirements; unknown is stored as null, never zero.

## Unified bundled ranking fields

Each unified entry records `affiliatedOwnership.status` as `Accepted`, `Unknown`,
or `Excluded`; `outsideCapital.status` as `Accepted` or `Unknown`; an
`upperEstimate` flag; and a confidence score, label, and component breakdown.
Evidence lists, unknowns, notes, and source IDs preserve the review trail.

Confidence components total 100 possible points. An `Unknown` ownership review
cannot receive the full ownership-completeness maximum, and an `Unknown`
outside-capital review cannot receive the full outside-capital-completeness
maximum. Unknown monetary deductions remain null and unapplied, never zero.

## Ranking fields

Calculation rows expose nullable `scoreUsd` and `rank`, `rankingEligibility`, exact `rankingEligibilityReasons`, `reviewedConfidence`, wallet and funding review status, separate freshness timestamps, and source/evidence links. Ranks are assigned contiguously only across eligible units.

Public views expose the same nullable and review-aware semantics:

- `current_scores`
- `current_leaderboard`
- `public_project_details`
- `public_wallet_evidence`
- `public_funding_evidence`

Every leaderboard row links to `Calculation & sources`. Project pages provide stable anchors: `#calculation`, `#market-data`, `#wallets`, `#funding`, and `#evidence`.
