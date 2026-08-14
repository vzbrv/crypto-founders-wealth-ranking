# Codex handoff: crypto founders outside-wealth ranking

Snapshot: 2026-07-30

## Files

- `candidate_universe.csv`: 30 stable project IDs, a current gross-value screen, known deductions, completeness states, and research actions.
- `wallet_evidence.csv`: public wallet/entity evidence with confidence and explicit inclusion decisions.
- `source_catalog.csv`: source IDs and plain URLs.
- `crypto_founders_top20_research.xlsx`: human-review workbook with formulas, checks, and methodology.

## Required scoring behavior

```
provisional_outside_wealth =
  gross_value
  - known_founder_team_excluded
  - verified_external_capital
  - other_deductions

canonical_outside_wealth =
  provisional_outside_wealth
  only when gross_status, founder_holdings_status, and capital_status are all Complete
```

Never convert blank/null/unknown amounts to zero in canonical calculations. The provisional score may treat unknown deductions as zero only when it is clearly labeled provisional.

## Import rules

1. Use `project_id` as the stable key; do not key on display names or tickers.
2. Refresh every market cap or equity value at import time and store the price/time/source used.
3. Count only founder/team-controlled assets already included in the gross valuation.
4. Do not deduct locked or unvested token allocations when the market-cap source already excludes them from circulating supply.
5. Do not treat protocol, foundation, DAO, or ecosystem treasury assets as personal founder holdings unless the methodology has a documented control rule.
6. Deduplicate transfers between attributed wallets; never sum address histories as balances.
7. Ignore spam and unsolicited airdrops when estimating founder-acquired wealth.
8. A public wallet proves only that wallet. It does not establish the person's total holdings.
9. Keep low-confidence and rumored addresses out of published calculations until confirmed.
10. For token projects, external capital includes primary equity financing and primary token-sale proceeds; exclude secondary-market purchases and investor-to-investor secondary sales.

## Binance and Coinbase

- Binance/BNB: rank on circulating BNB market cap. Keep private Binance valuation as context unless a defensible bridge removes overlap between the company and token values.
- Coinbase: rank on public-equity market capitalization. Founder exclusion comes from SEC-reported COIN shares, not personal crypto wallets.

## Suggested Codex task

Import the attached research files into `vzbrv/crypto-founders-wealth-ranking`. Preserve the status and confidence fields, keep blanks as null, implement separate provisional and canonical scores, add source links to every displayed number, and block publication of canonical ranks when any required status is not `Complete`. Refresh current market values before generating the site output.

## Publication gate

A row is publication-ready only when:

- valuation unit and double-count treatment are defined;
- gross value is current and sourced;
- founder/team controlled holdings included in gross value are complete enough for the stated confidence;
- external capital is fully reconciled;
- every included wallet has a public attribution source;
- every material excluded balance has a documented reason.

Canonical publication additionally requires a computed High confidence label.
Medium, Low, Insufficient, and any upper estimate stay research-only.
