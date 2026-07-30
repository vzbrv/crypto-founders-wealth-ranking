# Initial production candidate assessment

Reviewed: 2026-07-30

This assessment applies the repository methodology and current provider support. Candidate selection prioritizes reproducible evidence, not project prominence. A reliable market identifier or token-allocation document does not establish founder wallet ownership.

| Candidate | Founder or founding unit                              | Chain    | Required inputs available                                                                                                                                              | Missing inputs                                                                                                                                                     | Source-quality assessment                                                                                              | Recommended inclusion status         |
| --------- | ----------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Ethereum  | Eight-person founding team documented by Ethereum.org | Ethereum | CoinGecko `ethereum`; official founder history; official crowdsale and genesis-allocation records; native ETH supported by the EVM adapter                             | No primary-source attribution of current founder-controlled wallets; crowdsale USD proceeds are stated only approximately                                          | Strong primary documentation for identity, launch, sale, and allocation; insufficient address-level ownership evidence | **Include — research-only/unranked** |
| Uniswap   | Hayden Adams                                          | Ethereum | CoinGecko `uniswap`; official founder history; official UNI allocation and contract; official $11m Series A and $165m Series B; ERC-20 supported by the EVM adapter    | No defensible founder-controlled UNI wallet; an earlier seed round is acknowledged without an amount in the reviewed primary sources                               | Strong project-primary evidence for identity, allocation, contract, and two material funding rounds                    | **Include — research-only/unranked** |
| Solana    | Solana founding team                                  | Solana   | CoinGecko `solana`; official founding history; official token-supply disclosures; official $314,159,265 private token sale; native SOL supported by the Solana adapter | No defensible founder-controlled SOL wallet; reviewed primary sources do not establish a complete lifetime funding ledger                                          | Strong project/foundation-primary evidence and a directly supported native asset                                       | **Include — research-only/unranked** |
| Compound  | Robert Leshner and Geoffrey Hayes                     | Ethereum | CoinGecko `compound-governance-token`; official COMP contract and distribution documentation; ERC-20 supported by the EVM adapter                                      | No primary founder-wallet attribution; funding totals depend materially on secondary reporting; reviewed official sources do not provide a complete funding ledger | Strong official protocol/token evidence, weaker reproducibility for capital deduction and affiliated holdings          | Defer                                |
| Aave      | Stani Kulechov / Aave Labs                            | Ethereum | CoinGecko `aave`; official founder and protocol history; AAVE is an Ethereum ERC-20 supported by the EVM adapter                                                       | No defensible founder-wallet attribution; public funding disclosures are fragmented and do not produce a complete, primary-source capital ledger                   | Strong identity/protocol evidence, insufficiently complete funding and wallet evidence for the first release           | Defer                                |
| Optimism  | OP Labs founding unit                                 | Optimism | CoinGecko `optimism`; official allocation and governance documentation; public funding announcements                                                                   | The primary OP asset is on Optimism, for which the current curated balance-provider registry has no production adapter; no defensible founder-wallet attribution   | Strong allocation documentation, but not reproducible with the implemented Ethereum-mainnet/native-SOL adapters        | Defer until adapter support          |

## Selected release

Ethereum, Uniswap, and Solana have the best combination of primary-source provenance and implemented price/balance adapters. They are included as research records, not wealth rankings. Each remains unranked because no reviewed primary or defensible explorer source attributes a current score-affecting wallet to its founder or founding unit.

## Reviewed assumptions and limitations

- A `team_collective` attribution fraction of `1` assigns the whole project result to the named research unit. It is not an ownership, equity, token-allocation, or personal-wealth percentage.
- Hayden Adams is represented as the single founding unit for Uniswap. This does not imply that he owns all UNI or all Uniswap Labs equity.
- Solana and Ethereum use collective founding units because the reviewed primary sources document multi-person founding histories without defensible ownership splits.
- USD-denominated Uniswap and Solana announcements are included in capital deduction at their disclosed USD amounts. No currency conversion is performed.
- Ethereum's crowdsale event is recorded, but its BTC and USD amounts are left unset because the reviewed primary source states them only approximately. It is excluded from capital deduction; unknown is not converted to zero.
- `tracked-wallets.json` is empty. The current schema requires a blockchain address for every wallet record, so it cannot encode a missing or unknown address as a row. Project methodology notes preserve this unresolved input, and `insufficient` confidence keeps every entry out of rankings.
- Foundation, treasury, ecosystem, grants, exchange, and unknown addresses are not treated as founder-controlled. No such address is included without address-level ownership evidence.

## Primary candidate sources

- CoinGecko coin records: [Ethereum](https://api.coingecko.com/api/v3/coins/ethereum?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false), [Uniswap](https://api.coingecko.com/api/v3/coins/uniswap?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false), [Solana](https://api.coingecko.com/api/v3/coins/solana?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false), [Compound](https://api.coingecko.com/api/v3/coins/compound-governance-token?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false), [Aave](https://api.coingecko.com/api/v3/coins/aave?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false), [Optimism](https://api.coingecko.com/api/v3/coins/optimism?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false)
- Ethereum founder history and crowdsale summary: <https://ethereum.org/en/ethereum-history-founder-and-ownership/>
- Ethereum crowdsale announcement: <https://blog.ethereum.org/2014/07/22/launching-the-ether-sale>
- Uniswap history: <https://blog.uniswap.org/uniswap-history>
- UNI allocation and contract: <https://blog.uniswap.org/uni>
- Uniswap Series A: <https://blog.uniswap.org/uniswap-raise>
- Uniswap Series B: <https://blog.uniswap.org/bringing-web3-to-everyone>
- Solana Foundation formation: <https://solana.com/news/announcing-the-formation-of-the-solana-foundation>
- Solana founding history: <https://solana.com/news/solana-summer>
- Solana supply disclosure: <https://solana.com/news/solana-will-reduce-its-token-supply-to-account-for-market-making-allocation>
- Solana private token sale: <https://solana.com/news/solana-labs-completes-a-314-15m-private-token-sale-led-by-andreessen-horowitz-and-polychain-capital>
- Compound COMP documentation: <https://compound.finance/governance/comp>
- Aave history and founder: <https://aave.com/about>
- Optimism allocation documentation: <https://docs.optimism.io/governance/capital-allocation>
