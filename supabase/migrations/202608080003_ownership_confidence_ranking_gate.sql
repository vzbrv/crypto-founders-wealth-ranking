-- Forward-only ranking gate: only high-confidence founder ownership may affect
-- a published score. Non-score-affecting wallets remain available as evidence.

create or replace function public.is_score_eligible_wallet(
  p_classification text,
  p_ownership_confidence text
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = public
as $$
  select p_ownership_confidence = 'high'
    and p_classification in ('founder', 'cofounder', 'founder_controlled_company');
$$;

grant execute on function public.is_score_eligible_wallet(text, text) to public;

do $migration$
declare
  function_definition text;
begin
  function_definition := pg_get_functiondef(
    'recalculate_rankings(text)'::regprocedure
  );

  if position('w.circulating_inclusion_fraction,' in function_definition) = 0
    or position('awm.review_status = ''approved_sufficient''' in function_definition) = 0
    or position('public.is_score_eligible_wallet(awm.classification' in function_definition) > 0 then
    raise exception 'Unable to apply ownership confidence gate to recalculate_rankings';
  end if;

  function_definition := replace(
    function_definition,
    'w.circulating_inclusion_fraction,',
    'w.classification,
      w.ownership_confidence,
      w.circulating_inclusion_fraction,'
  );
  function_definition := replace(
    function_definition,
    'awm.review_status = ''approved_sufficient''',
    'public.is_score_eligible_wallet(awm.classification, awm.ownership_confidence)
        and awm.review_status = ''approved_sufficient'''
  );

  execute function_definition;
end;
$migration$;

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
    when public.is_score_eligible_wallet(wallets.classification, wallets.ownership_confidence)
      and wallets.affects_score
      and wallets.balance_included_in_circulating_supply
      and wallets.review_status = 'approved_sufficient'
      and wallets.circulating_inclusion_fraction is not null
      and balances.normalized_balance is not null
    then balances.normalized_balance * wallets.circulating_inclusion_fraction
  end as deductible_balance,
  case
    when public.is_score_eligible_wallet(wallets.classification, wallets.ownership_confidence)
      and wallets.affects_score
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
