-- Support per-entry carry-forward in hourly-ranking-snapshot.
--
-- A single symbol a provider persistently omits (observed in production:
-- Yahoo Finance dropped "COIN" from its batch response for 6+ consecutive
-- hourly runs) used to abort the entire snapshot — all 20 entries failed
-- to publish over one flaky ticker. This RPC lets the edge function look
-- up that one entry's last known-good price from the most recent
-- *published* snapshot, so it can carry that value forward (naturally
-- marked "stale" downstream via the existing data-age calculation) while
-- every other entry still gets fresh data.

create or replace function get_last_known_market_input(p_entry_id text)
returns table (
  price_usd numeric,
  circulating_supply numeric,
  gross_value_usd numeric,
  observed_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(inputs.token_price_usd, inputs.public_company_price_usd) as price_usd,
    inputs.circulating_supply,
    inputs.gross_value_usd,
    inputs.original_observation_at as observed_at
  from hourly_snapshot_inputs inputs
  join hourly_snapshots snapshot on snapshot.id = inputs.snapshot_id
  where inputs.entry_id = p_entry_id
    and snapshot.status = 'published'
    and coalesce(inputs.token_price_usd, inputs.public_company_price_usd) is not null
    and inputs.original_observation_at is not null
  order by snapshot.observation_at desc
  limit 1;
$$;

comment on function get_last_known_market_input(text) is
  'Returns the most recent published price/observation for one hourly-ranking entry, for carry-forward when a provider omits that symbol. Returns zero rows if no prior published value exists.';

revoke all on function get_last_known_market_input(text) from public, anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function get_last_known_market_input(text) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function get_last_known_market_input(text) to service_role';
  end if;
end;
$$;
