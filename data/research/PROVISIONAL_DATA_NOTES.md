# Provisional ranking inputs

These files support the separate provisional outside-holder value screen. They do not change the canonical research ranking or assert founder wealth.

## Files

- `provisional_market_data.csv`: circulating token market-value snapshots observed on 2026-07-30. Refresh before publication.
- `provisional_capital_events.csv`: reviewed disclosed outside-capital events. Most rows are partial coverage, as stated in `notes`.
- `source_catalog.csv`: canonical titles, dates, URLs, quality labels, and limitations for every `source_id` used by both files.

Coinbase is excluded because its valuation basis is public-equity market capitalization, not circulating token market value. Projects without supported market observations are omitted. Missing funding evidence is omitted and remains unknown; it is never converted to a zero deduction. Zero is used only for the reviewed Bitcoin, Dogecoin, and Litecoin fair launches.

The provisional calculation is:

`circulating market value - verified affiliated circulating holdings - reviewed disclosed outside capital`

Unknown deductions are omitted from arithmetic, so affected results are upper estimates that may be overstated. Wallet holdings are not deducted until both attribution and overlap with circulating supply are verified.
