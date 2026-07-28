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
  scores.outside_holder_supply
from projects
left join current_project_scores scores on scores.project_id = projects.id
where projects.status = 'active';

drop view if exists public_wallet_evidence;
create view public_wallet_evidence with (security_invoker = true) as
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
    when wallets.affects_score and wallets.circulating_inclusion_fraction is not null
      then coalesce(balances.normalized_balance, 0) * wallets.circulating_inclusion_fraction
    else 0
  end as deductible_balance,
  case
    when wallets.affects_score and wallets.circulating_inclusion_fraction is not null
      then coalesce(balances.normalized_balance, 0) * wallets.circulating_inclusion_fraction * coalesce(markets.price_usd, 0)
    else 0
  end as deductible_value_usd
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
  select observation.price_usd, observation.observed_at
  from market_observations observation
  where observation.asset_id = assets.id and observation.is_valid
  order by observation.observed_at desc, observation.id desc
  limit 1
) markets on true
where wallets.status = 'active';

drop view if exists public_source_claims;
create view public_source_claims with (security_invoker = true) as
with record_projects as (
  select 'project'::text as record_type, projects.id as record_id, projects.id as project_id
  from projects
  union all
  select 'founding_unit', links.founding_unit_id, links.project_id
  from project_founding_units links
  union all
  select 'asset', assets.id, assets.project_id
  from assets
  union all
  select 'tracked_wallet', wallets.id, wallets.project_id
  from tracked_wallets wallets
  union all
  select 'funding_round', rounds.id, rounds.project_id
  from funding_rounds rounds
)
select
  links.id,
  mapping.project_id,
  projects.slug as project_slug,
  projects.name as project_name,
  links.record_type,
  links.record_id,
  links.field,
  links.support_type,
  links.notes,
  sources.id as source_id,
  sources.title,
  sources.url,
  sources.publisher,
  sources.source_type,
  sources.published_at,
  sources.accessed_at,
  sources.description,
  sources.status
from record_sources links
join record_projects mapping
  on mapping.record_type = links.record_type and mapping.record_id = links.record_id
join projects on projects.id = mapping.project_id and projects.status = 'active'
join source_records sources on sources.id = links.source_record_id
where sources.status <> 'superseded';

grant select on public_project_details, public_wallet_evidence, public_source_claims to anon;
