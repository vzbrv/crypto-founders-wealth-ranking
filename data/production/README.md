# Reviewed production data

This directory contains the first reviewed production research set: Ethereum,
Uniswap, and Solana. All three projects have `insufficient` confidence and remain
unranked because no reviewed source defensibly attributes a current
founder-controlled wallet. The public result is exactly 0 ranked and 3 research
units; none has high confidence. `tracked-wallets.json` is therefore empty; an
unknown wallet is not represented as a zero balance.

Ethereum, Uniswap, and Solana have wallet and funding reviews marked
`reviewed_insufficient`. Their score and rank remain null and the UI reports
`Research in progress`. Any calculation from known inputs is provisional only.

The seven JSON files are validated together by `packages/curated-data`. Source links
cover material claims and required calculation inputs. The unresolved evidence and
manually reviewed assumptions are recorded in project methodology notes and
`docs/initial-production-candidates.md`.

The production validator and synchronizer reject the synthetic `data/` fixtures and
require the production marker in this directory.
