# Ranking methodology

## Core formula

`project score = max(0, circulating market value − affiliated circulating holdings value − disclosed outside capital)`

`founding-unit score = sum(project score × project attribution fraction)`

The ranked subject is a founding unit: either an individual founder or a documented founding team. Each project has one active canonical founding unit unless sourced allocation fractions explicitly divide attribution and sum to one.

## Rules

- Unknown is never converted to zero. A score is unavailable when required inputs are unknown.
- The project score is clamped at zero; deductions cannot create negative wealth.
- Token quantities and money use arbitrary-precision Decimal arithmetic, not binary floating point.
- Only circulating value is included. Fully diluted valuation is excluded.
- Stablecoins are excluded from project-asset market value unless a later sourced methodology decision says otherwise.
- Affiliated balances are deducted only when reviewed, sourced, and actually circulating. Non-circulating balances are not deducted from circulating market value.
- A balance or funding event is deducted once by its stable deduplication key. Overlapping wallet ownership and duplicate funding disclosures block ranking rather than double-subtract.
- A wallet with unknown circulation treatment remains visible, lowers confidence, and makes the project score unavailable; it is never assumed fully included or excluded.
- Outside capital is valued at the event date using sourced event terms; it is not revalued as current wealth.
- The funding ledger covers every disclosed outside-capital type. Missing or unresolved funding preserves the known subtotal but makes the project score unavailable.
- Confidence describes evidence quality and remains separate from the monetary score.
- Market, chain, curated-record, calculation, and publication freshness timestamps remain separate.

## Review states and zero

Wallet and funding review statuses are `not reviewed`, `in progress`, `approved/sufficient`, and `reviewed insufficient`. A reviewed zero is valid only with reviewer, review timestamp, notes, and evidence. A bare numeric zero is not a completed review. Once an address is approved for tracking, the ingestion job fetches its balance; researchers do not invent a manual balance.

## Ranking eligibility

A founding unit receives a contiguous rank only when every linked project has recent sourced market data, an approved funding review, an approved sufficient wallet review, evidence for every included deduction and excluded wallet, and confidence above `insufficient`. Otherwise rank and score are null and the UI says `Research in progress` with exact eligibility reasons. A numeric subtotal alone never makes a unit rankable.

## Confidence

The evidence-quality score is out of 100: founder identity 10, founder-wallet coverage 20, team/foundation/treasury coverage 20, circulation treatment 20, funding completeness 20, and market reliability 10. Labels are High at 85+, Medium at 65+, Low at 40+, and Insufficient below 40. Insufficient-confidence units are unranked.

## Canonical and live values

Persisted, validated calculations are canonical. Any later live overlay is labeled provisional, includes its own freshness, and cannot overwrite the canonical result without completing validation and persistence. The metric is `Estimated outside-holder token value`; it is a research estimate and explicitly not personal wealth.
