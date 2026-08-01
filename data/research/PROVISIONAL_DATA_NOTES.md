# Provisional ranking inputs

These files support the separate provisional outside-holder value screen. They do not change the canonical research ranking or assert founder wealth.

## Files

- `provisional_market_data.csv`: circulating token market-value snapshots from CoinGecko's `/coins/{id}/history?date=30-07-2026&localization=false` endpoint. All rows use the `coingecko_coin_history_v3` method at `2026-07-30T00:00:00Z` and separately preserve coin ID, fetch time, direct request URL, and value.
- `provisional_capital_events.csv`: only reviewed disclosed outside-capital amounts directly supported by their linked source. The retained events are Solana, Sui, Uniswap, NEAR, and Ondo.
- `source_catalog.csv`: canonical titles, dates, URLs, quality labels, and limitations for every `source_id` used by both files.

Coinbase is excluded because its valuation basis is public-equity market capitalization, not circulating token market value. Projects without supported market observations are omitted. Missing or indirectly supported funding evidence is omitted and remains unknown; it is never converted to a zero deduction.

The provisional calculation is:

`circulating market value - verified affiliated circulating holdings - reviewed disclosed outside capital`

Unknown deductions are omitted from arithmetic, so affected results are upper estimates that may be overstated. Wallet holdings are not deducted until both attribution and overlap with circulating supply are verified.
