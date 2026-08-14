# High-confidence ranking research

Research snapshot: 2026-08-09. These are candidate sources, not accepted ranking inputs.

## Enforcement result

- Canonical v2 publication now requires computed `high` confidence.
- An upper estimate is capped at `Medium` unless a sourced, independently
  reviewed uncertainty range proves that its best- and worst-case ranks match.
- Coinbase is the only current bundled row that satisfies both conditions.
- Circle is now `Medium`: its score is 91, but it remains an upper estimate.
- No researched candidate in this change promotes or reprices a ranking.
- No current row uses the bounded rank-invariance exception.

## Workbook intake

The 2026-08-09 top-10 workbook was reconciled to the bundled ranking rows. It contains 46 evidence claims across 10 token projects and 18 unresolved review items. Every project is explicitly marked `ineligible` in the workbook.

- USDC maps to the Circle ranking row; Tether/USDT has no current bundled top-10 row.
- Coinbase is not covered by the workbook, so its accepted inputs are unchanged.
- Primary filings and official project sources strengthen individual ownership, supply, or financing subclaims, but none closes every required ownership and outside-capital component at one snapshot.
- The workbook therefore changes no score, confidence label, upper-estimate flag, rank, or production input.

The row-by-row result is recorded in `top10-confidence-recalculation-2026-08-09.csv`.
The public-evidence limits are classified in
`top10-public-verifiability-review-2026-08-09.csv`.

## Public-company candidates

| Project        | Primary filing evidence                                                                                                              | Remaining work                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Coinbase       | The 2026 proxy reports Brian Armstrong with 8,167,972 Class A and 25,639,618 Class B shares on the proxy basis.                      | Reconcile Fred Ehrsam, later transactions, derivatives, price, and share counts to one ranking snapshot.         |
| Circle         | The 2026 proxy reports Jeremy Allaire with 56,408 Class A and 17,708,642 Class B shares as of 2026-03-16.                            | Reconcile the later Form 4, Sean Neville, derivatives, price, and share counts to one snapshot.                  |
| Figure         | The 2026 proxy reports Michael Cagney with 6,146,654 Class A and 43,119,814 Class B shares.                                          | Reconcile June Ou, later transactions, derivatives, price, share counts, and all pre-listing capital.            |
| Galaxy Digital | A 2026 Form 4 reports 190,465,103 Class B shares after a charitable gift by the reporting structure controlled by Michael Novogratz. | Reconcile all share classes, conversion economics, derivatives, later transactions, and all pre-listing capital. |

## Token-project candidates

Official Sui, Avalanche, and Hedera materials establish supply or historical allocation context. They do not establish a complete current founder-controlled wallet inventory. Hyperliquid's self-funded claim supports the narrower conclusion that no external financing or investor token allocation is publicly disclosed; it does not prove that no outside capital ever entered an affiliated legal entity. None is sufficient by itself to remove an upper-estimate flag.

The project-by-project work queue is in `high-confidence-evidence-gaps.csv`.

## Promotion checklist

A ranking may move to high-confidence publication only when all of the following are snapshot-aligned:

1. Every publicly resolvable ownership and capital input has strong primary evidence.
2. Primary attribution, exclusions, current balances or share counts, circulation,
   derivatives, and deduplication are documented.
3. Capital events have USD-at-event values and explicit accepted/excluded decisions;
   financing is not assigned to a project when public filings do not support it.
4. Any `not_publicly_verifiable` input has sourced conservative numeric bounds.
5. Both bounds produce the same rank, with no unresolved contradiction or double
   counting, and an independent reviewer approves the analysis.
6. The computed score is at least 85 and the strict publication gate passes.

`missing_research` and `disputed` inputs cannot use the bounded exception. Publicly
unverifiable facts are retained as limits rather than represented as complete or zero.
