# Arkham integration report

## Audit status

The curated audit covers 41 ranked-unit search rows. This branch contains the
server-side adapter, normalized evidence path, review gates, provider-health
controls, daily schedule, and the curated audit seed. The execution environment
did not contain `ARKHAM_API_KEY`, so no live Arkham result is claimed or
committed; the audit rows remain candidates with null observations.

The review matrix is [arkham-entity-audit.json](../data/production/arkham-entity-audit.json).

| Result               | Count | Treatment                                                        |
| -------------------- | ----: | ---------------------------------------------------------------- |
| Research-only, unrun |    40 | Non-scoring candidate; live discovery and manual review required |
| Binance              |     1 | Excluded as custodial/customer assets by default                 |
| Score-affecting rows |     0 | No reviewer-approved evidence was available                      |

## Ranking impact

No rows changed. Before and after Arkham affiliated-holdings deductions are
unchanged because no Arkham quantity was accepted. No confidence component or
published rank changed. Missing balances remain `null`/Unknown; they are not
converted to zero.

Accepted evidence language for future reviewed partial holdings is:

- Arkham-confirmed known entity subtotal
- Coverage incomplete
- Predicted wallets excluded
- Custodial assets excluded
- Last verified [timestamp]

## Non-scoring evidence

Search results, predicted addresses, rumored addresses, ambiguous aliases,
unreviewed mappings, unrelated tokens, and incomplete entity inventories remain
research evidence only. Binance exchange/customer assets are excluded by
default. HyperEVM and HyperCore coverage remain separate. Satoshi is treated as
a disputed Patoshi-pattern cluster, not a complete cryptographic inventory.

## Remaining manual review

After the secure deployment and one-time audit run, reviewers must resolve
entity-to-founding-unit mappings, owner class, custodial status, project-token
reconciliation, circulation treatment, duplicate/overlap keys, and inventory
completeness. Approval is explicit and cannot promote a row automatically.

## Operational blockers

1. Set `ARKHAM_API_KEY` only as a Supabase Edge Function secret and run the
   documented one-time audit command.
2. Review the resulting candidate matrix before any approval.
3. Establish independent circulation and completeness evidence for any
   deduction that should affect ranking.
4. Keep the daily refresh within the configured credit threshold; failed or
   partial runs carry forward only under the existing staleness policy.
