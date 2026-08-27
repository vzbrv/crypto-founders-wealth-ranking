# Reviewed production data

This directory contains two deliberately separate production data tracks:

1. The normalized review set contains Ethereum, Uniswap, and Solana. All three
   projects have `insufficient` confidence and remain unranked because no
   reviewed source defensibly attributes a current founder-controlled wallet.
   `tracked-wallets.json` is therefore empty; an unknown wallet is not
   represented as a zero balance.
2. `unified-ranking.json` contains the reviewed July 30 unified provisional
   universe used by the public hourly ranking. It has exactly 20 source-backed
   founding units. Eighteen are upper estimates, 16 have unknown affiliated
   ownership, 16 have unknown outside capital, and only 2 are High confidence.
   It is not canonical wealth data and does not change normalized project
   eligibility.

Unknown ownership cannot receive the full 25-point ownership-completeness score,
and unknown outside capital cannot receive the full 15-point
outside-capital-completeness score. Partial completeness credit does not make a
deduction accepted: the status, notes, and sources remain authoritative, and an
unknown deduction stays null and unapplied. Research should address ownership
and financing for the highest-ranked upper estimates before price-frequency
improvements.

Ethereum, Uniswap, and Solana have wallet and funding reviews marked
`reviewed_insufficient`. Their score and rank remain null and the UI reports
`Research in progress`. Any calculation from known inputs is provisional only.

The seven normalized JSON files and the unified provisional document are validated
by `packages/curated-data`. Source links cover material claims and required
calculation inputs. The unresolved evidence and manually reviewed assumptions are
recorded in project methodology notes and
`archive/2026-08-research/docs/initial-production-candidates.md`.

The production validator and synchronizer reject the synthetic `data/` fixtures and
require the production marker in this directory.
