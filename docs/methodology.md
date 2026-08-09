# Ranking methodology

## What the ranking measures

The primary metric is **estimated value created for outside holders or
shareholders**. It is not a founder's personal net worth, liquid wealth, or wallet
balance.

The ranked subject is a founding unit: either a popular individual founder or a
documented founding team. The displayed founder/team label identifies that unit.
Each economic project appears once in the unified ranking, so listing several
well-known founders does not multiply the project's value.

All monetary calculations use arbitrary-precision Decimal arithmetic rather than
binary floating point.

## Current unified ranking

For each ranking entry, define:

- `G`: current gross circulating market value
- `A`: accepted current value held by affiliated founders, teams, foundations,
  treasuries, or controlled companies
- `C`: accepted disclosed outside capital, valued in USD at each event date
- `V`: estimated value created for outside holders or shareholders

The published calculation is:

`V = G - A* - C*`

where `A* = A` when the affiliated-ownership review is accepted and `C* = C`
when the outside-capital review is accepted. A pending or unknown deduction is
left `Unknown` in the record and temporarily contributes `0` only to the
provisional calculation. That placeholder is not a factual claim that the
deduction is zero.

Consequently:

- if both deductions are accepted, `V = G - A - C`;
- if either deduction is unknown, the row is marked as an upper estimate;
- an accepted deduction must have supporting sources;
- an excluded item is not deducted, but its exclusion must remain reviewable;
- the hourly publisher rejects a missing, non-finite, or negative final value.

This provisional unknown handling is specific to the current unified top-20
ranking. The stricter project engine described below leaves a score unavailable
when a required deduction is unknown.

### Gross value

For a token or network, gross value is the sourced circulating market
capitalization:

`G_token = M_circulating`

Fully diluted valuation is not used. Stablecoins are excluded unless a later,
sourced methodology revision explicitly includes them.

For a public company with share classes `k`:

`S_total = sum(S_k)`

`G_public = P_share x S_total`

where `P_share` is the observed share price and `S_k` is shares outstanding for
class `k`.

### Affiliated ownership

For a public company with an accepted affiliated share total:

`A_public = P_share x S_affiliated`

An accepted token-affiliation deduction is not yet supported by the unified
calculator because it needs a reviewed supply-inclusion and price model. Such a
record must remain unknown until the required wallet and circulation evidence is
available.

### Outside capital

For accepted funding events `e`:

`C = sum(C_e)`

`C_e` is the sourced USD amount at the event date, not the current value of the
assets received. Excluded, disputed, and scenario-only events do not enter the
accepted subtotal. If the complete ledger is not accepted, `C` remains unknown.

### Ranking and ties

Rows are ordered by `V` descending. Exact ties are broken by stable entry ID
ascending. Ranks are contiguous and one-based:

`rank_i = position_i + 1`

The production dataset must contain exactly 20 unique entries and stored ranks
must reproduce this calculation. Coinbase is represented once as one economic
entity.

## Hourly live calculation

The hourly snapshot recalculates `G` from the newest valid market observation,
then applies the same `A`, `C`, and `V` formulas. Its calculation version is
`unified-v1-hourly` and its ranking mode is `unified_provisional`.

Token observations may be carried forward for at most 2 hours. Public-market
observations may be carried forward for at most 7 days. A row is labeled stale
when its observation is more than 90 minutes old, even if it remains within the
maximum carry-forward window.

Observation age is:

`age_seconds = floor((snapshot_time - observed_at) / 1 second)`

The publisher requires all 20 calculations, ranks them as one set, and publishes
the snapshot header, results, inputs, and sources atomically. A failed run does
not replace the last complete snapshot.

For an entry present in the previous complete live snapshot:

`rank_change = previous_rank - current_rank`

A positive value means the entry moved up, a negative value means it moved down,
and zero means no movement. The first complete snapshot is a baseline; a newly
appearing entry has no rank change.

## Individuals, teams, and attribution

The public ranking shows recognizable individuals and the documented team when
the founding unit is collective. Popularity affects presentation only; it never
changes `V`.

The stricter multi-project engine assigns every project to one canonical founding
unit by default. If reliable sources justify an allocation among units, fractions
must be in `[0, 1]` and sum to `1` for that project:

`V_unit = sum(V_project x attribution_fraction)`

If any linked project is unavailable, the founding-unit score is unavailable.
This prevents the same project value from being credited in full to several
individuals.

## Strict wallet-aware project calculation

The repository also contains a stricter calculation engine for reviewed wallet
and project data. It is the target model for a fully evidenced ranking, but its
research-only records are not automatically eligible for the current unified
top 20.

For a token project, define:

- `P`: current token price
- `S`: circulating supply
- `E`: reviewed affiliated token quantity included in circulating supply
- `C`: reviewed outside-capital total

Then:

`M_derived = P x S`

`S_outside = S - E`

`affiliated_value = P x E`

`outside_holder_value = P x (S - E)`

`V_project = max(0, P x (S - E) - C)`

If `E` or `C` is unknown, `V_project` is unavailable; unknown is never converted
to zero in this strict engine.

### Wallet and circulating-supply deduction

For each score-affecting wallet `w`:

`E_w = balance_w x circulating_inclusion_fraction_w`

The official affiliated quantity is:

`E = sum(E_w)`

A score-affecting wallet is deductible only when ownership confidence is high,
the owner is an eligible founder/cofounder/controlled-company class, the review
is approved and sufficient, evidence is complete, and both balance and
circulation treatment are known. A reviewed wallet known to be outside
circulating supply contributes zero. Unknown treatment makes `E` unavailable.

Wallets are deduplicated by a stable key. Duplicates block the official result
instead of being subtracted twice. The UI may show a known subtotal, but that
subtotal is not an official `E` until the entire review is complete.

### Funding deduction

Only accepted, score-included, evidenced events with a known USD-at-event amount
enter:

`C_known = sum(accepted included event amounts)`

The official `C` is available only after the full funding ledger has a sufficient
review and no unresolved duplicates or missing inclusion decisions. A known
subtotal does not make an incomplete project rankable.

### Market reconciliation

The derived circulating value is compared with the provider value:

`difference = abs(M_derived - M_provider)`

`variance = difference / M_derived`, when `M_derived > 0`

The default tolerance is 5%. When `M_derived = 0`, reconciliation passes only if
the provider value is also zero.

## Evidence confidence and eligibility

Confidence measures evidence quality separately from monetary value:

| Component                         | Maximum points |
| --------------------------------- | -------------: |
| Founder identity                  |             10 |
| Founder-wallet coverage           |             20 |
| Team/foundation/treasury coverage |             20 |
| Circulation treatment             |             20 |
| Funding completeness              |             20 |
| Market reliability                |             10 |
| **Total**                         |        **100** |

The label thresholds are High at 85+, Medium at 65+, Low at 40+, and
Insufficient below 40. A missing component makes the evidence insufficient even
when the numeric subtotal is higher.

In the strict engine, a founding unit ranks only when every linked project has a
non-null score, recent sourced market data, sufficient wallet and funding
reviews, complete evidence, and confidence above Insufficient. Otherwise its
rank and score are null and the exact eligibility reasons remain visible.
Passing that calculation gate does not authorize canonical publication: the
publication gate separately requires High confidence.

## Review states, zero, and precision

Wallet and funding reviews use `not reviewed`, `in progress`,
`approved/sufficient`, and `reviewed insufficient`. A reviewed zero is valid only
with a reviewer, review timestamp, notes, and evidence. A bare numeric zero is
not a completed review. Once an address is approved for tracking, ingestion
fetches its balance; researchers do not invent a manual balance.

The unified ranking publishes USD values to two decimal places. The strict engine
preserves Decimal precision and exposes detailed USD values to eight decimal
places. Market, chain, curated-record, calculation, and publication timestamps
remain separate so freshness is not inferred from a single date.
