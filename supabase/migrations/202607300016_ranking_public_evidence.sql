-- Correct ranking terminology and expose only review evidence linked to the
-- corresponding public record.

alter table project_founding_units
  add column if not exists is_canonical boolean not null default false,
  add column if not exists allocation_methodology text;

alter table market_observations
  add column if not exists source_url text,
  add column if not exists source_description text;

alter table tracked_wallets
  add column if not exists circulating_inclusion_explanation text;

alter table funding_rounds
  add column if not exists amount_status text,
  add column if not exists usd_conversion_date date,
  add column if not exists inclusion_reason text;

update funding_rounds
set
  amount_status = coalesce(
    amount_status,
    case when amount_usd_at_event is null then 'unknown' else 'exact' end
  ),
  inclusion_reason = coalesce(
    nullif(inclusion_reason, ''),
    'Legacy record migrated before an explicit inclusion rationale was required.'
  );

alter table funding_rounds
  alter column amount_status set not null,
  alter column inclusion_reason set not null;

alter table funding_rounds
  drop constraint if exists funding_rounds_round_type_check,
  drop constraint if exists funding_rounds_amount_status_check,
  drop constraint if exists funding_rounds_amount_status_value_check;

alter table funding_rounds
  add constraint funding_rounds_round_type_check check (
    round_type in (
      'pre_seed',
      'seed',
      'equity',
      'venture',
      'private',
      'private_token_sale',
      'strategic',
      'accelerator',
      'public',
      'public_token_sale',
      'crowdsale',
      'grant',
      'debt',
      'other'
    )
  ),
  add constraint funding_rounds_amount_status_check check (
    amount_status in ('exact', 'approximate', 'unknown')
  ),
  add constraint funding_rounds_amount_status_value_check check (
    (amount_status = 'unknown') = (amount_usd_at_event is null)
  );

create or replace view current_scores with (security_invoker = true) as
select
  projects.id as project_id,
  projects.slug,
  projects.name,
  projects.symbol,
  scores.score_usd,
  scores.market_cap_usd,
  scores.outside_holder_value_usd,
  scores.capital_raised_usd,
  scores.confidence_label,
  scores.data_freshness,
  scores.calculation_breakdown,
  scores.warnings,
  scores.calculated_at,
  scores.calculated_at is null or scores.calculated_at < now() - interval '20 minutes' as is_stale,
  case
    when scores.calculated_at is null then 'score_unavailable'
    when scores.calculated_at < now() - interval '20 minutes' then 'refresh_overdue'
  end as stale_reason,
  coalesce(scores.eligibility_status, 'research_in_progress') as eligibility_status,
  coalesce(scores.ineligibility_reasons, '["calculation unavailable"]'::jsonb) as ineligibility_reasons,
  projects.wallet_review_status,
  projects.funding_review_status,
  coalesce(scores.confidence_label, projects.confidence_level, 'insufficient') as reviewed_confidence,
  jsonb_build_object(
    'calculation', '/project/' || projects.slug || '#calculation',
    'marketData', '/project/' || projects.slug || '#market-data',
    'wallets', '/project/' || projects.slug || '#wallets',
    'funding', '/project/' || projects.slug || '#funding',
    'evidence', '/project/' || projects.slug || '#evidence'
  ) as calculation_links
from projects
left join current_project_scores scores on scores.project_id = projects.id
where projects.status = 'active';

create or replace view current_leaderboard with (security_invoker = true) as
select
  scores.rank,
  scores.previous_rank,
  scores.rank_change,
  scores.score_usd,
  scores.confidence_label,
  scores.calculated_at,
  units.id as founding_unit_id,
  units.slug,
  units.display_name,
  units.description,
  units.image_url,
  units.iq_wiki_slug,
  scores.project_breakdown,
  scores.warnings,
  coalesce(scores.eligibility_status, 'research_in_progress') as eligibility_status,
  coalesce(scores.ineligibility_reasons, '["calculation unavailable"]'::jsonb) as ineligibility_reasons,
  case when scores.eligibility_status = 'ranked' then 'Ranked' else 'Research in progress' end as research_status,
  coalesce(scores.confidence_label, 'insufficient') as reviewed_confidence,
  (
    select case
      when count(*) = 0 then 'not_reviewed'
      when bool_and(projects.wallet_review_status = 'approved_sufficient') then 'approved_sufficient'
      when bool_or(projects.wallet_review_status = 'in_progress') then 'in_progress'
      when bool_or(projects.wallet_review_status = 'not_reviewed') then 'not_reviewed'
      else 'reviewed_insufficient'
    end
    from project_founding_units links
    join projects on projects.id = links.project_id and projects.status = 'active'
    where links.founding_unit_id = units.id
  ) as wallet_review_status,
  (
    select case
      when count(*) = 0 then 'not_reviewed'
      when bool_and(projects.funding_review_status = 'approved_sufficient') then 'approved_sufficient'
      when bool_or(projects.funding_review_status = 'in_progress') then 'in_progress'
      when bool_or(projects.funding_review_status = 'not_reviewed') then 'not_reviewed'
      else 'reviewed_insufficient'
    end
    from project_founding_units links
    join projects on projects.id = links.project_id and projects.status = 'active'
    where links.founding_unit_id = units.id
  ) as funding_review_status,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'projectId', projects.id,
      'projectSlug', projects.slug,
      'calculation', '/project/' || projects.slug || '#calculation',
      'marketData', '/project/' || projects.slug || '#market-data',
      'wallets', '/project/' || projects.slug || '#wallets',
      'funding', '/project/' || projects.slug || '#funding',
      'evidence', '/project/' || projects.slug || '#evidence'
    ) order by projects.slug)
    from project_founding_units links
    join projects on projects.id = links.project_id and projects.status = 'active'
    where links.founding_unit_id = units.id
  ), '[]'::jsonb) as calculation_links
from founding_units units
left join current_founding_unit_scores scores on scores.founding_unit_id = units.id
where units.status = 'active'
  and exists (
    select 1
    from project_founding_units links
    join projects on projects.id = links.project_id and projects.status = 'active'
    where links.founding_unit_id = units.id
  )
order by scores.rank nulls last, units.display_name;

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
  ), '[]'::jsonb) as funding_review_evidence
from projects
left join current_project_scores scores on scores.project_id = projects.id
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
  ), '[]'::jsonb) as review_evidence
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

grant select on current_scores, current_leaderboard, public_leaderboard,
  public_project_details, public_wallet_evidence to anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on current_scores, current_leaderboard, public_leaderboard, public_project_details, public_wallet_evidence to authenticated';
  end if;
end;
$$;
