# Data sources

Phase 8 implements CoinGecko market data, Ethereum native/ERC-20 balances through a replaceable viem RPC adapter, and native Solana balances through JSON-RPC. CI uses injected responses and makes no real provider calls. Provider terms, quotas, and pricing must be reviewed before production deployment.

| Domain       | Candidate adapter | Intended data                 | Status                     |
| ------------ | ----------------- | ----------------------------- | -------------------------- |
| Market       | CoinGecko         | price, circulating supply     | implemented in Phase 4     |
| EVM          | viem + JSON-RPC   | native and ERC-20 balances    | implemented in Phase 7     |
| EVM explorer | Etherscan         | public address links          | implemented in Phase 6     |
| Solana       | JSON-RPC          | native account balances       | implemented in Phase 8     |
| Substrate    | Subscan           | public account and asset data | interface placeholder only |
| TON          | TON Center        | public account and token data | interface placeholder only |

Every material curated claim must later carry a direct source, retrieval date, and review state. Secondary sources may guide research but do not replace claim-level evidence.
