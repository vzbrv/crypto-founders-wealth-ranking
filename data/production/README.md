# Reviewed production data

This directory contains the first reviewed production research set: Ethereum,
Uniswap, and Solana. All three projects have `insufficient` confidence and remain
unranked because no reviewed source defensibly attributes a current
founder-controlled wallet. `tracked-wallets.json` is therefore empty; an unknown
wallet is not represented as a zero balance.

The seven JSON files are validated together by `packages/curated-data`. Source links
cover material claims and required calculation inputs. The unresolved evidence and
manually reviewed assumptions are recorded in project methodology notes and
`docs/initial-production-candidates.md`.

The production validator and synchronizer reject the synthetic `data/` fixtures and
require the production marker in this directory.
