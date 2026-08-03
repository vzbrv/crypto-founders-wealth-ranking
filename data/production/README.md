# Reviewed production data

This directory contains two deliberately separate production data tracks:

1. The normalized review set contains Ethereum, Uniswap, and Solana. All three
   projects have `insufficient` confidence and remain unranked because no
   reviewed source defensibly attributes a current founder-controlled wallet.
   `tracked-wallets.json` is therefore empty; an unknown wallet is not
   represented as a zero balance.
2. `unified-ranking.json` contains the reviewed July 30 unified provisional
   universe used by the public hourly ranking. It has exactly 20 source-backed
   founding units, but several are explicitly upper estimates because ownership
   or outside-capital evidence is incomplete. It is not canonical wealth data
   and does not change normalized project eligibility.

Ethereum, Uniswap, and Solana have wallet and funding reviews marked
`reviewed_insufficient`. Their score and rank remain null and the UI reports
`Research in progress`. Any calculation from known inputs is provisional only.

The seven normalized JSON files and the unified provisional document are validated
by `packages/curated-data`. Source links cover material claims and required
calculation inputs. The unresolved evidence and manually reviewed assumptions are
recorded in project methodology notes and `docs/initial-production-candidates.md`.

The production validator and synchronizer reject the synthetic `data/` fixtures and
require the production marker in this directory.
