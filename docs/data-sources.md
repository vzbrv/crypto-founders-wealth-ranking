# Data sources

Phase 8 implements CoinGecko market data, Ethereum native/ERC-20 balances through a replaceable viem RPC adapter, and native Solana balances through JSON-RPC. CI uses injected responses and makes no real provider calls. Provider terms, quotas, and pricing must be reviewed before production deployment.

| Domain       | Candidate adapter | Intended data                 | Status                     |
| ------------ | ----------------- | ----------------------------- | -------------------------- |
| Market       | CoinGecko         | price, circulating supply     | implemented                |
| EVM          | viem + JSON-RPC   | native and ERC-20 balances    | implemented                |
| EVM explorer | Etherscan         | public address links          | implemented                |
| Solana       | JSON-RPC          | native account balances       | implemented                |
| Substrate    | Subscan           | public account and asset data | interface placeholder only |
| TON          | TON Center        | public account and token data | interface placeholder only |

Every material curated claim must carry a direct source, retrieval date, and review state. Every included deduction and excluded wallet needs evidence. A reviewed zero also needs reviewer, timestamp, notes, and evidence. Missing evidence is displayed as a missing state and blocks ranking. Secondary sources, including Arkham labels, may guide research but do not replace claim-level evidence or constitute attribution on their own.

For the unified ranking, research the highest-ranked upper estimates first.
Beneficial ownership requires filings, signed disclosures, or an exhaustive
address attestation establishing the controlled set. Outside capital requires a
reviewed event ledger supported by direct disclosures or filings. Market-price
frequency improves freshness, but it does not resolve either evidence gap or
justify higher confidence on its own.
