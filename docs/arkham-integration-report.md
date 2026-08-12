# Arkham integration report

## Audit status

The curated audit covers 41 ranked-unit search rows. This branch contains the
server-side adapter, normalized evidence path, review gates, provider-health
controls, daily schedule, and the curated audit seed. The execution environment
did not contain `ARKHAM_API_KEY`, so no live Arkham result is claimed or
committed; the audit rows remain candidates with null observations.

The review matrix is [arkham-entity-audit.json](../data/production/arkham-entity-audit.json).

| Result               | Count | Treatment                                                |
| -------------------- | ----: | -------------------------------------------------------- |
| Candidate rows       |    41 | Non-scoring; live discovery and manual review required   |
| Default treatment    |     1 | Binance excluded as custodial/customer assets by default |
| Score-affecting rows |     0 | No reviewer-approved evidence was available              |

## Approval decision

Do not approve any seeded row for ranking use. All 41 rows have null Arkham
entity, chain, quantity, confirmation, owner-class, and observation fields.
The Binance exclusion is a safe default, not positive ownership evidence. The
acceptance gate therefore cannot be satisfied by this audit seed.

Approval can be considered only row by row after a server-side Arkham run
returns a unique mapping and reconciled project-token quantity, followed by
explicit review of ownership, custodial status, circulation treatment,
deduplication, source evidence, and completeness. There is no blanket approval
path.

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

1. Run the one-time audit through the deployed Supabase Edge Function. Keep
   `ARKHAM_API_KEY` server-side; this local audit makes no live Arkham claim.
2. Review the resulting candidate matrix before any approval.
3. Establish independent circulation and completeness evidence for any
   deduction that should affect ranking.
4. Keep the daily refresh within the configured credit threshold; failed or
   partial runs carry forward only under the existing staleness policy.
