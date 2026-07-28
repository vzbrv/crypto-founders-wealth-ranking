# Ranking methodology

## Core formula

`project score = price × (circulating supply − excluded supply) − qualifying outside capital`

`founding-unit score = sum(project score × project attribution fraction)`

The ranked subject is a founding unit, not necessarily one individual. Membership and project affiliations require explicit sourced records.

## Rules

- Unknown is never converted to zero. A score is unavailable when required inputs are unknown.
- Negative results are valid and remain negative.
- Token quantities and money use arbitrary-precision Decimal arithmetic, not binary floating point.
- Only circulating value is included. Fully diluted valuation is excluded.
- Stablecoins are excluded from project-asset market value unless a later sourced methodology decision says otherwise.
- Affiliated holdings are deducted only with an approved, sourced inclusion fraction.
- A wallet with unknown circulation treatment remains visible, lowers confidence, and makes the project score unavailable; it is never assumed fully included or excluded.
- Outside capital is valued at the event date using sourced event terms; it is not revalued as current wealth.
- Missing included funding preserves the known subtotal but makes the project score unavailable.
- Confidence describes evidence quality and remains separate from the monetary score.
- Market, chain, curated-record, calculation, and publication freshness timestamps remain separate.

## Confidence

The evidence-quality score is out of 100: founder identity 10, founder-wallet coverage 20, team/foundation/treasury coverage 20, circulation treatment 20, funding completeness 20, and market reliability 10. Labels are High at 85+, Medium at 65+, Low at 40+, and Insufficient below 40. Insufficient-confidence units are unranked.

## Canonical and live values

Persisted, validated calculations are canonical. Any later live overlay is labeled provisional, includes its own freshness, and cannot overwrite the canonical result without completing validation and persistence.
