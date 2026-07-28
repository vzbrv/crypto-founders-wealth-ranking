create or replace function recalculate_rankings(p_trigger_type text default 'market_sync')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  insert into calculation_runs (trigger_type, methodology_version, status, metadata)
  values (p_trigger_type, 'phase-4', 'running', jsonb_build_object('formula', 'outside_holder_value_minus_capital'))
  returning id into v_run_id;

  with latest_market as (
    select distinct on (asset_id) *
    from market_observations
    where is_valid
    order by asset_id, observed_at desc, id desc
  ), active_wallet_mappings as (
    select wam.asset_id, w.id as wallet_id, w.circulating_inclusion_fraction
    from wallet_asset_mappings wam
    join tracked_wallets w on w.id = wam.tracked_wallet_id
    where w.status = 'active' and w.affects_score
  ), latest_wallet as (
    select distinct on (tracked_wallet_id, asset_id) *
    from wallet_balance_observations
    where is_valid
    order by tracked_wallet_id, asset_id, observed_at desc, id desc
  ), wallet_rollup as (
    select
      awm.asset_id,
      count(*) as required_count,
      count(lw.id) as observed_count,
      bool_or(awm.circulating_inclusion_fraction is null) as has_unknown_fraction,
      coalesce(sum(lw.normalized_balance * awm.circulating_inclusion_fraction), 0) as excluded_supply,
      max(lw.observed_at) as observed_at
    from active_wallet_mappings awm
    left join latest_wallet lw
      on lw.tracked_wallet_id = awm.wallet_id and lw.asset_id = awm.asset_id
    group by awm.asset_id
  ), funding_rollup as (
    select
      project_id,
      count(*) filter (where amount_usd_at_event is null) as missing_count,
      coalesce(sum(amount_usd_at_event), 0) as capital_raised
    from funding_rounds
    where status = 'active' and include_in_capital_deduction
    group by project_id
  ), inputs as (
    select
      p.id as project_id,
      p.confidence_level,
      a.id as asset_id,
      lm.id as market_observation_id,
      lm.observed_at as market_observed_at,
      lm.price_usd,
      lm.circulating_supply,
      coalesce(wr.required_count, 0) as required_wallet_count,
      coalesce(wr.observed_count, 0) as observed_wallet_count,
      coalesce(wr.has_unknown_fraction, false) as has_unknown_fraction,
      coalesce(wr.excluded_supply, 0) as excluded_supply,
      wr.observed_at as wallet_observed_at,
      coalesce(fr.missing_count, 0) as missing_funding_count,
      coalesce(fr.capital_raised, 0) as capital_raised
    from projects p
    join assets a on a.project_id = p.id and a.is_primary and a.is_active
    left join latest_market lm on lm.asset_id = a.id
    left join wallet_rollup wr on wr.asset_id = a.id
    left join funding_rollup fr on fr.project_id = p.id
    where p.status = 'active' and p.calculation_category = 'liquid_token'
  ), evaluated as (
    select *,
      market_observation_id is not null
      and required_wallet_count = observed_wallet_count
      and not has_unknown_fraction
      and missing_funding_count = 0
      and excluded_supply <= circulating_supply as sufficient
    from inputs
  )
  insert into project_scores (
    calculation_run_id, project_id, asset_id, price_usd, circulating_supply,
    market_cap_usd, excluded_supply, excluded_value_usd, capital_raised_usd,
    outside_holder_supply, outside_holder_value_usd, score_usd, confidence_label,
    market_observation_id, data_freshness, calculation_breakdown, warnings
  )
  select
    v_run_id, project_id, asset_id, price_usd, circulating_supply,
    case when sufficient then price_usd * circulating_supply end,
    case when sufficient then excluded_supply end,
    case when sufficient then price_usd * excluded_supply end,
    case when sufficient then capital_raised end,
    case when sufficient then circulating_supply - excluded_supply end,
    case when sufficient then price_usd * (circulating_supply - excluded_supply) end,
    case when sufficient then price_usd * (circulating_supply - excluded_supply) - capital_raised end,
    case when sufficient then confidence_level else 'insufficient' end,
    market_observation_id,
    jsonb_build_object('marketObservedAt', market_observed_at, 'walletObservedAt', wallet_observed_at),
    jsonb_build_object(
      'priceUsd', price_usd,
      'circulatingSupply', circulating_supply,
      'excludedSupply', excluded_supply,
      'capitalRaisedUsd', capital_raised,
      'requiredWalletCount', required_wallet_count,
      'observedWalletCount', observed_wallet_count
    ),
    to_jsonb(array_remove(array[
      case when market_observation_id is null then 'Missing valid market observation' end,
      case when required_wallet_count <> observed_wallet_count then 'Missing valid wallet observation' end,
      case when has_unknown_fraction then 'Wallet inclusion fraction is unknown' end,
      case when missing_funding_count > 0 then 'Funding amount is incomplete' end,
      case when market_observation_id is not null and excluded_supply > circulating_supply then 'Excluded supply exceeds circulating supply' end
    ]::text[], null))
  from evaluated;

  with previous as (
    select founding_unit_id, rank
    from current_founding_unit_scores
  ), aggregates as (
    select
      pfu.founding_unit_id,
      case when bool_and(ps.score_usd is not null)
        then sum(ps.score_usd * pfu.attribution_fraction)
      end as score_usd,
      bool_and(ps.score_usd is not null) as sufficient,
      jsonb_agg(jsonb_build_object(
        'projectId', pfu.project_id,
        'attributionFraction', pfu.attribution_fraction,
        'projectScoreUsd', ps.score_usd,
        'attributedScoreUsd', ps.score_usd * pfu.attribution_fraction
      ) order by pfu.project_id) as project_breakdown
    from project_founding_units pfu
    join founding_units fu on fu.id = pfu.founding_unit_id and fu.status = 'active'
    join projects p on p.id = pfu.project_id and p.status = 'active' and p.calculation_category = 'liquid_token'
    left join project_scores ps on ps.project_id = pfu.project_id and ps.calculation_run_id = v_run_id
    group by pfu.founding_unit_id
  ), ranked as (
    select
      aggregates.*,
      case when score_usd is not null then rank() over (order by score_usd desc nulls last)::integer end as new_rank
    from aggregates
  )
  insert into founding_unit_scores (
    calculation_run_id, founding_unit_id, score_usd, rank, previous_rank,
    rank_change, project_breakdown, confidence_label, warnings
  )
  select
    v_run_id, r.founding_unit_id, r.score_usd, r.new_rank, p.rank,
    case when r.new_rank is not null and p.rank is not null then p.rank - r.new_rank end,
    r.project_breakdown,
    case when r.sufficient then 'high' else 'insufficient' end,
    case when r.sufficient then '[]'::jsonb else '["One or more project scores are unavailable"]'::jsonb end
  from ranked r
  left join previous p on p.founding_unit_id = r.founding_unit_id;

  update calculation_runs
  set status = 'completed', completed_at = now()
  where id = v_run_id;

  return v_run_id;
exception when others then
  if v_run_id is not null then
    update calculation_runs
    set status = 'failed', completed_at = now(), error_summary = sqlerrm
    where id = v_run_id;
  end if;
  raise;
end;
$$;

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
  v_accepted integer := 0;
  v_run_id uuid;
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
        circulating_supply, market_cap_usd, raw_payload, is_valid
      ) values (
        v_asset_id, 'coingecko', v_observed_at, v_fetched_at, v_price,
        v_supply, v_market_cap, coalesce(v_item->'rawPayload', '{}'::jsonb), true
      );
      v_accepted := v_accepted + 1;
    exception when others then
      continue;
    end;
  end loop;

  if v_accepted > 0 then
    v_run_id := recalculate_rankings('market_sync');
  end if;

  return query select v_accepted, v_run_id;
end;
$$;

revoke all on function recalculate_rankings(text) from public, anon;
revoke all on function ingest_market_sync(jsonb, jsonb) from public, anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function recalculate_rankings(text) to service_role';
    execute 'grant execute on function ingest_market_sync(jsonb, jsonb) to service_role';
  end if;
end;
$$;
