-- Persist CoinGecko observation evidence and expose it beside every public
-- calculation that depends on the observation.

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

  if v_accepted > 0 then
    v_run_id := recalculate_rankings('market_sync');
  end if;

  return query select v_accepted, v_run_id;
end;
$$;

revoke all on function ingest_market_sync(jsonb, jsonb) from public, anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function ingest_market_sync(jsonb, jsonb) to service_role';
  end if;
end;
$$;

create or replace view public_project_details with (security_invoker = true) as
select
  projects.id,
  projects.slug,
  projects.name,
  projects.symbol,
  projects.description,
  projects.project_type,
  projects.confidence_level,
  projects.methodology_notes,
  projects.iq_wiki_slug,
  projects.website_url,
  projects.launched_at,
  projects.research_reviewed_at,
  scores.score_usd,
  scores.market_cap_usd,
  scores.outside_holder_value_usd,
  scores.capital_raised_usd,
  scores.data_freshness,
  scores.calculation_breakdown,
  scores.warnings,
  scores.calculated_at,
  scores.asset_id,
  scores.price_usd,
  scores.circulating_supply,
  scores.excluded_supply,
  scores.excluded_value_usd,
  scores.outside_holder_supply,
  coalesce(scores.eligibility_status, 'research_in_progress') as eligibility_status,
  coalesce(scores.ineligibility_reasons, '["calculation unavailable"]'::jsonb) as ineligibility_reasons,
  projects.wallet_review_status,
  projects.wallet_review_reviewer,
  projects.wallet_review_reviewed_at,
  projects.wallet_review_notes,
  projects.wallet_review_evidence_source_ids,
  projects.funding_review_status,
  projects.funding_review_reviewer,
  projects.funding_review_reviewed_at,
  projects.funding_review_notes,
  projects.funding_review_evidence_source_ids,
  coalesce(scores.confidence_label, projects.confidence_level, 'insufficient') as reviewed_confidence,
  jsonb_build_object(
    'calculation', '/project/' || projects.slug || '#calculation',
    'marketData', '/project/' || projects.slug || '#market-data',
    'wallets', '/project/' || projects.slug || '#wallets',
    'funding', '/project/' || projects.slug || '#funding',
    'evidence', '/project/' || projects.slug || '#evidence'
  ) as calculation_links,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sources.id,
      'title', sources.title,
      'url', sources.url,
      'publisher', sources.publisher,
      'sourceType', sources.source_type,
      'publishedAt', sources.published_at,
      'accessedAt', sources.accessed_at
    ) order by sources.publisher, sources.title, sources.id)
    from jsonb_array_elements_text(
      case when jsonb_typeof(projects.wallet_review_evidence_source_ids) = 'array'
        then projects.wallet_review_evidence_source_ids else '[]'::jsonb end
    ) evidence(source_id)
    join source_records sources on sources.id::text = evidence.source_id
    where exists (
      select 1 from record_sources links
      where links.record_type = 'project'
        and links.record_id = projects.id
        and links.source_record_id = sources.id
    )
  ), '[]'::jsonb) as wallet_review_evidence,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sources.id,
      'title', sources.title,
      'url', sources.url,
      'publisher', sources.publisher,
      'sourceType', sources.source_type,
      'publishedAt', sources.published_at,
      'accessedAt', sources.accessed_at
    ) order by sources.publisher, sources.title, sources.id)
    from jsonb_array_elements_text(
      case when jsonb_typeof(projects.funding_review_evidence_source_ids) = 'array'
        then projects.funding_review_evidence_source_ids else '[]'::jsonb end
    ) evidence(source_id)
    join source_records sources on sources.id::text = evidence.source_id
    where exists (
      select 1 from record_sources links
      where links.record_type = 'project'
        and links.record_id = projects.id
        and links.source_record_id = sources.id
    )
  ), '[]'::jsonb) as funding_review_evidence,
  scores.market_observation_id,
  observations.provider as market_provider,
  observations.source_url as market_source_url,
  observations.source_description as market_source_description,
  observations.observed_at as market_observed_at,
  observations.fetched_at as market_fetched_at,
  case
    when observations.observed_at is null then 'unknown'
    when observations.observed_at >= now() - interval '20 minutes' then 'current'
    else 'stale'
  end as market_freshness_status
from projects
left join current_project_scores scores on scores.project_id = projects.id
left join market_observations observations on observations.id = scores.market_observation_id
where projects.status = 'active';

create or replace view public_wallet_evidence with (security_invoker = true) as
select
  wallets.id,
  wallets.project_id,
  wallets.founding_unit_id,
  assets.id as asset_id,
  projects.slug as project_slug,
  projects.name as project_name,
  assets.symbol as asset_symbol,
  wallets.label,
  wallets.address,
  wallets.chain_code,
  wallets.classification,
  wallets.ownership_confidence,
  wallets.circulating_inclusion_fraction,
  wallets.affects_score,
  wallets.research_reviewed_at,
  wallets.notes,
  balances.normalized_balance as balance,
  balances.observed_at as balance_observed_at,
  balances.provider as balance_provider,
  markets.price_usd,
  markets.observed_at as market_observed_at,
  case
    when wallets.affects_score
      and wallets.balance_included_in_circulating_supply
      and wallets.review_status = 'approved_sufficient'
      and wallets.circulating_inclusion_fraction is not null
      and balances.normalized_balance is not null
    then balances.normalized_balance * wallets.circulating_inclusion_fraction
  end as deductible_balance,
  case
    when wallets.affects_score
      and wallets.balance_included_in_circulating_supply
      and wallets.review_status = 'approved_sufficient'
      and wallets.circulating_inclusion_fraction is not null
      and balances.normalized_balance is not null
      and markets.price_usd is not null
    then balances.normalized_balance * wallets.circulating_inclusion_fraction * markets.price_usd
  end as deductible_value_usd,
  wallets.balance_included_in_circulating_supply,
  wallets.deduplication_key,
  wallets.review_status,
  wallets.reviewer,
  wallets.reviewed_at,
  wallets.evidence_source_ids,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', sources.id,
      'title', sources.title,
      'url', sources.url,
      'publisher', sources.publisher,
      'sourceType', sources.source_type,
      'publishedAt', sources.published_at,
      'accessedAt', sources.accessed_at
    ) order by sources.publisher, sources.title, sources.id)
    from jsonb_array_elements_text(
      case when jsonb_typeof(wallets.evidence_source_ids) = 'array'
        then wallets.evidence_source_ids else '[]'::jsonb end
    ) evidence(source_id)
    join source_records sources on sources.id::text = evidence.source_id
    where exists (
      select 1 from record_sources links
      where links.record_type = 'tracked_wallet'
        and links.record_id = wallets.id
        and links.source_record_id = sources.id
    )
  ), '[]'::jsonb) as review_evidence,
  markets.market_observation_id,
  markets.provider as market_provider,
  markets.source_url as market_source_url,
  markets.source_description as market_source_description,
  markets.fetched_at as market_fetched_at,
  case
    when markets.observed_at is null then 'unknown'
    when markets.observed_at >= now() - interval '20 minutes' then 'current'
    else 'stale'
  end as market_freshness_status
from tracked_wallets wallets
join projects on projects.id = wallets.project_id and projects.status = 'active'
join wallet_asset_mappings mappings on mappings.tracked_wallet_id = wallets.id
join assets on assets.id = mappings.asset_id and assets.is_active
left join lateral (
  select observation.normalized_balance, observation.observed_at, observation.provider
  from wallet_balance_observations observation
  where observation.tracked_wallet_id = wallets.id
    and observation.asset_id = assets.id
    and observation.is_valid
  order by observation.observed_at desc, observation.id desc
  limit 1
) balances on true
left join lateral (
  select observation.id as market_observation_id,
    observation.price_usd, observation.observed_at, observation.fetched_at,
    observation.provider, observation.source_url, observation.source_description
  from market_observations observation
  where observation.asset_id = assets.id and observation.is_valid
  order by observation.observed_at desc, observation.id desc
  limit 1
) markets on true
where wallets.status = 'active';

grant select on public_project_details, public_wallet_evidence to anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on public_project_details, public_wallet_evidence to authenticated';
  end if;
end;
$$;
