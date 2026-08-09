# High-confidence ranking research

Research snapshot: 2026-08-09. These are candidate sources, not accepted ranking inputs.

## Enforcement result

- Canonical v2 publication now requires computed `high` confidence.
- A bundled row cannot display `High` while `upperEstimate` is true.
- Coinbase is the only current bundled row that satisfies both conditions.
- Circle is now `Medium`: its score is 91, but it remains an upper estimate.
- No researched candidate in this change promotes or reprices a ranking.

## Public-company candidates

| Project        | Primary filing evidence                                                                                                              | Remaining work                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Coinbase       | The 2026 proxy reports Brian Armstrong with 8,167,972 Class A and 25,639,618 Class B shares on the proxy basis.                      | Reconcile Fred Ehrsam, later transactions, derivatives, price, and share counts to one ranking snapshot.         |
| Circle         | The 2026 proxy reports Jeremy Allaire with 56,408 Class A and 17,708,642 Class B shares as of 2026-03-16.                            | Reconcile the later Form 4, Sean Neville, derivatives, price, and share counts to one snapshot.                  |
| Figure         | The 2026 proxy reports Michael Cagney with 6,146,654 Class A and 43,119,814 Class B shares.                                          | Reconcile June Ou, later transactions, derivatives, price, share counts, and all pre-listing capital.            |
| Galaxy Digital | A 2026 Form 4 reports 190,465,103 Class B shares after a charitable gift by the reporting structure controlled by Michael Novogratz. | Reconcile all share classes, conversion economics, derivatives, later transactions, and all pre-listing capital. |

## Token-project candidates

Official Sui, Avalanche, and Hedera materials establish supply or historical allocation context. They do not establish a complete current founder-controlled wallet inventory. Hyperliquid's self-funded claim can support a capital review only after the complete financing history is reconciled. None is sufficient by itself to remove an upper-estimate flag.

The project-by-project work queue is in `high-confidence-evidence-gaps.csv`.

## Promotion checklist

A ranking may move to high-confidence publication only when all of the following are snapshot-aligned and independently reviewed:

1. Complete founder, team, foundation, and affiliated-wallet or beneficial-ownership inventory.
2. Primary attribution for each included holding, with exclusions documented.
3. Current balances or share counts, circulation treatment, derivative treatment, and deduplication.
4. Complete lifetime outside-capital ledger with USD-at-event values and accepted/excluded decisions.
5. Fresh market inputs, no critical unknowns, no unresolved double counting, and no upper-estimate flag.
6. Computed score of at least 85 and a passing strict publication gate.
