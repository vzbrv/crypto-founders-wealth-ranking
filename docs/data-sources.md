# Data sources

Phase 7 implements CoinGecko market data and Ethereum native/ERC-20 balances through a replaceable viem RPC adapter. CI uses injected responses and makes no real provider calls. Provider terms, quotas, and pricing must be reviewed before production deployment.

| Domain       | Candidate adapter | Intended data                 | Status                     |
| ------------ | ----------------- | ----------------------------- | -------------------------- |
| Market       | CoinGecko         | price, circulating supply     | implemented in Phase 4     |
| EVM          | viem + JSON-RPC   | native and ERC-20 balances    | implemented in Phase 7     |
| EVM explorer | Etherscan         | public address links          | implemented in Phase 6     |
| Solana       | Helius            | public account and token data | interface placeholder only |
| Substrate    | Subscan           | public account and asset data | interface placeholder only |
| TON          | TON Center        | public account and token data | interface placeholder only |

Every material curated claim must later carry a direct source, retrieval date, and review state. Secondary sources may guide research but do not replace claim-level evidence.
