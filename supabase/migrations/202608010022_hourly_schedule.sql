-- Market observations may refresh frequently, but ranking publication is hourly.
-- Keep ingestion transactional and leave calculation/publishing to the hourly job.

create or replace function ingest_market_sync(p_observations jsonb, p_health jsonb)
returns table (accepted_count integer, calculation_run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_asset_id uuid;
  v_observed_at timestamptz;
  v_fetched_at timestamptz;
  v_price numeric(38, 18);
  v_supply numeric(78, 18);
  v_market_cap numeric(38, 8);
  v_source_url text;
  v_source_description text;
  v_accepted integer := 0;
  v_checked_at timestamptz := now();
begin
  begin
    if p_health ? 'checkedAt' then v_checked_at := (p_health->>'checkedAt')::timestamptz; end if;
  exception when others then
    v_checked_at := now();
  end;

  insert into provider_health (
    provider, checked_at, status, latency_ms, error_code, error_message, metadata
  ) values (
    coalesce(nullif(p_health->>'provider', ''), 'coingecko'),
    v_checked_at,
    case when p_health->>'status' in ('healthy', 'degraded', 'failed') then p_health->>'status' else 'failed' end,
    case when coalesce(p_health->>'responseTimeMs', '') ~ '^[0-9]+$' then (p_health->>'responseTimeMs')::integer end,
    nullif(p_health->>'errorCode', ''),
    nullif(p_health->>'errorMessage', ''),
    coalesce(p_health->'metadata', '{}'::jsonb)
  );

  if jsonb_typeof(p_observations) <> 'array' then
    return query select 0, null::uuid;
    return;
  end if;

  for v_item in select value from jsonb_array_elements(p_observations)
  loop
    begin
      v_asset_id := null;
      select a.id into v_asset_id
      from assets a
      join projects p on p.id = a.project_id
      where a.id::text = v_item->>'assetId'
        and a.coingecko_id = v_item->>'coingeckoId'
        and a.is_active and p.status = 'active';

      if v_asset_id is null
        or v_item->>'provider' <> 'coingecko'
        or coalesce(v_item->>'priceUsd', '') !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(v_item->>'circulatingSupply', '') !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(v_item->>'marketCapUsd', '') !~ '^[0-9]+([.][0-9]+)?$'
      then
        continue;
      end if;

      v_observed_at := (v_item->>'observedAt')::timestamptz;
      v_fetched_at := (v_item->>'fetchedAt')::timestamptz;
      v_price := (v_item->>'priceUsd')::numeric;
      v_supply := (v_item->>'circulatingSupply')::numeric;
      v_market_cap := (v_item->>'marketCapUsd')::numeric;
      v_source_url := nullif(btrim(v_item->>'sourceUrl'), '');
      v_source_description := nullif(btrim(v_item->>'sourceDescription'), '');

      if v_price <= 0 or v_supply < 0 or v_market_cap < 0
        or v_observed_at > now() + interval '5 minutes'
        or exists (
          select 1 from market_observations mo
          where mo.asset_id = v_asset_id and mo.provider = 'coingecko'
            and mo.is_valid and mo.observed_at >= v_observed_at
        )
      then
        continue;
      end if;

      insert into market_observations (
        asset_id, provider, observed_at, fetched_at, price_usd,
        circulating_supply, market_cap_usd, source_url, source_description,
        raw_payload, is_valid
      ) values (
        v_asset_id, 'coingecko', v_observed_at, v_fetched_at, v_price,
        v_supply, v_market_cap, v_source_url, v_source_description,
        coalesce(v_item->'rawPayload', '{}'::jsonb), true
      );
      v_accepted := v_accepted + 1;
    exception when others then
      continue;
    end;
  end loop;

  return query select v_accepted, null::uuid;
end;
$$;

revoke all on function ingest_market_sync(jsonb, jsonb) from public, anon;
grant execute on function ingest_market_sync(jsonb, jsonb) to service_role;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid from cron.job where jobname = 'calculate-rankings'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  for v_job in
    select jobid from cron.job where jobname = 'hourly-ranking-snapshot'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'hourly-ranking-snapshot',
    '7 * * * *',
    $schedule$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/hourly-ranking-snapshot',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := '{}'::jsonb
      );
    $schedule$
  );
end;
$$;
