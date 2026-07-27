# Ranking methodology

## Core formula

`estimated liquid crypto wealth = current circulating market value - approved affiliated circulating holdings - qualifying outside capital`

The ranked subject is a founding unit, not necessarily one individual. Membership and project affiliations require explicit sourced records.

## Rules

- Unknown is never converted to zero. A score is unavailable when required inputs are unknown.
- Negative results are valid and remain negative.
- Token quantities and money use arbitrary-precision Decimal arithmetic, not binary floating point.
- Only circulating value is included. Fully diluted valuation is excluded.
- Stablecoins are excluded from project-asset market value unless a later sourced methodology decision says otherwise.
- Affiliated holdings are deducted only with an approved, sourced inclusion fraction.
- Outside capital is valued at the event date using sourced event terms; it is not revalued as current wealth.
- Confidence describes evidence quality and remains separate from the monetary score.
- Market, chain, curated-record, calculation, and publication freshness timestamps remain separate.

## Canonical and live values

Persisted, validated calculations are canonical. Any later live overlay is labeled provisional, includes its own freshness, and cannot overwrite the canonical result without completing validation and persistence.
