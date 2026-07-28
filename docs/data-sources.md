# Data sources

Phase 4 implements the CoinGecko market adapter. CI uses injected responses and makes no real provider calls. Provider terms, quotas, and pricing must be reviewed before production deployment.

| Domain       | Candidate adapter | Intended data                 | Status                     |
| ------------ | ----------------- | ----------------------------- | -------------------------- |
| Market       | CoinGecko         | price, circulating supply     | implemented in Phase 4     |
| EVM          | Alchemy           | balances, RPC data            | interface placeholder only |
| EVM explorer | Etherscan         | public address and token data | interface placeholder only |
| Solana       | Helius            | public account and token data | interface placeholder only |
| Substrate    | Subscan           | public account and asset data | interface placeholder only |
| TON          | TON Center        | public account and token data | interface placeholder only |

Every material curated claim must later carry a direct source, retrieval date, and review state. Secondary sources may guide research but do not replace claim-level evidence.
