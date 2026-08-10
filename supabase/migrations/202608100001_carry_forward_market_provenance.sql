-- Preserve the source and fetch timestamp when market data is carried forward.
-- Without these fields, the snapshot handler would misattribute an older value
-- to the current provider and current fetch time.

drop function if exists public.get_last_known_market_input(text);

create function public.get_last_known_market_input(p_entry_id text)
returns table (
  price_usd numeric,
  circulating_supply numeric,
  gross_value_usd numeric,
  observed_at timestamptz,
  source_url text,
  source_name text,
  fetched_at timestamptz
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
    inputs.original_observation_at as observed_at,
    source.source_url,
    source.source_name,
    source.fetched_at
  from public.hourly_snapshot_inputs inputs
  join public.hourly_snapshots snapshot on snapshot.id = inputs.snapshot_id
  left join public.hourly_snapshot_sources source
    on source.snapshot_id = inputs.snapshot_id
    and source.source_id = 'market:' || inputs.entry_id
  where inputs.entry_id = p_entry_id
    and snapshot.status = 'published'
    and coalesce(inputs.token_price_usd, inputs.public_company_price_usd) is not null
    and inputs.original_observation_at is not null
  order by snapshot.observation_at desc
  limit 1;
$$;

comment on function public.get_last_known_market_input(text) is
  'Returns the most recent published price, observation, and market-source provenance for one hourly-ranking entry, for carry-forward when a provider omits that symbol. Returns zero rows if no prior published value exists.';

revoke all on function public.get_last_known_market_input(text) from public, anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.get_last_known_market_input(text) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.get_last_known_market_input(text) to service_role';
  end if;
end;
$$;
