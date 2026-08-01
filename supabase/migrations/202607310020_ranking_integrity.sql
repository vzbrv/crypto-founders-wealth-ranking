-- Keep founding-unit attribution unambiguous and expose calculated confidence
-- without allowing the legacy manual project confidence to affect eligibility.

create unique index if not exists project_founding_units_one_canonical_per_project_idx
  on project_founding_units (project_id)
  where is_canonical;

create or replace function validate_project_founding_unit_integrity(
  target_project_id uuid
)
returns void
language plpgsql
as $$
declare
  allocation_count integer;
  allocation_total numeric;
begin
  select count(*), coalesce(sum(attribution_fraction), 0)
  into allocation_count, allocation_total
  from project_founding_units
  where project_id = target_project_id;

  if allocation_count > 0 and allocation_total <> 1 then
    raise exception 'project founding-unit allocations must sum to 1'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from project_founding_units individual_links
    join founding_units individual_units
      on individual_units.id = individual_links.founding_unit_id
      and individual_units.entity_type = 'individual'
    join founding_unit_members individual_members
      on individual_members.founding_unit_id = individual_units.id
    join project_founding_units team_links
      on team_links.project_id = individual_links.project_id
    join founding_units team_units
      on team_units.id = team_links.founding_unit_id
      and team_units.entity_type = 'team'
    join founding_unit_members team_members
      on team_members.founding_unit_id = team_units.id
    where individual_links.project_id = target_project_id
      and individual_members.person_id = team_members.person_id
  ) then
    raise exception 'a person cannot be allocated individually and through a team'
      using errcode = '23514';
  end if;
end;
$$;

create or replace function enforce_project_founding_unit_integrity()
returns trigger
language plpgsql
as $$
declare
  target_project_id uuid;
begin
  if tg_table_name = 'project_founding_units' then
    if tg_op in ('INSERT', 'UPDATE') then
      perform validate_project_founding_unit_integrity(new.project_id);
    end if;

    if tg_op = 'DELETE'
      or (tg_op = 'UPDATE' and old.project_id is distinct from new.project_id) then
      perform validate_project_founding_unit_integrity(old.project_id);
    end if;
  else
    if tg_op in ('INSERT', 'UPDATE') then
      for target_project_id in
        select distinct project_id
        from project_founding_units
        where founding_unit_id = new.founding_unit_id
      loop
        perform validate_project_founding_unit_integrity(target_project_id);
      end loop;
    end if;

    if tg_op = 'DELETE'
      or (
        tg_op = 'UPDATE'
        and old.founding_unit_id is distinct from new.founding_unit_id
      ) then
      for target_project_id in
        select distinct project_id
        from project_founding_units
        where founding_unit_id = old.founding_unit_id
      loop
        perform validate_project_founding_unit_integrity(target_project_id);
      end loop;
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists project_founding_units_integrity_check
  on project_founding_units;
create constraint trigger project_founding_units_integrity_check
after insert or update or delete on project_founding_units
deferrable initially deferred
for each row execute function enforce_project_founding_unit_integrity();

drop trigger if exists founding_unit_members_integrity_check
  on founding_unit_members;
create constraint trigger founding_unit_members_integrity_check
after insert or update or delete on founding_unit_members
deferrable initially deferred
for each row execute function enforce_project_founding_unit_integrity();

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
  coalesce(scores.confidence_label, 'insufficient') as reviewed_confidence,
  jsonb_build_object(
    'calculation', '/project/' || projects.slug || '#calculation',
    'marketData', '/project/' || projects.slug || '#market-data',
    'wallets', '/project/' || projects.slug || '#wallets',
    'funding', '/project/' || projects.slug || '#funding',
    'confidence', '/project/' || projects.slug || '#confidence',
    'evidence', '/project/' || projects.slug || '#evidence'
  ) as calculation_links,
  scores.confidence_label as calculated_confidence_label,
  nullif(scores.calculation_breakdown -> 'confidence' ->> 'score', '')::numeric as confidence_total,
  coalesce(scores.calculation_breakdown -> 'confidence' -> 'components', '[]'::jsonb) as confidence_components,
  case
    when scores.calculation_breakdown is null then
      'Calculated confidence is unavailable until a current calculation is published.'
    when coalesce((scores.calculation_breakdown -> 'confidence' ->> 'complete')::boolean, false) then
      'All required evidence components are complete; the calculated label determines ranking eligibility.'
    else
      'One or more required evidence components are incomplete; calculated confidence is insufficient and the project is not eligible for ranking.'
  end as confidence_explanation
from projects
left join current_project_scores scores on scores.project_id = projects.id
where projects.status = 'active';

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
  coalesce(scores.confidence_label, 'insufficient') as reviewed_confidence,
  jsonb_build_object(
    'calculation', '/project/' || projects.slug || '#calculation',
    'marketData', '/project/' || projects.slug || '#market-data',
    'wallets', '/project/' || projects.slug || '#wallets',
    'funding', '/project/' || projects.slug || '#funding',
    'confidence', '/project/' || projects.slug || '#confidence',
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
  end as market_freshness_status,
  scores.confidence_label as calculated_confidence_label,
  nullif(scores.calculation_breakdown -> 'confidence' ->> 'score', '')::numeric as confidence_total,
  coalesce(scores.calculation_breakdown -> 'confidence' -> 'components', '[]'::jsonb) as confidence_components,
  case
    when scores.calculation_breakdown is null then
      'Calculated confidence is unavailable until a current calculation is published.'
    when coalesce((scores.calculation_breakdown -> 'confidence' ->> 'complete')::boolean, false) then
      'All required evidence components are complete; the calculated label determines ranking eligibility.'
    else
      'One or more required evidence components are incomplete; calculated confidence is insufficient and the project is not eligible for ranking.'
  end as confidence_explanation
from projects
left join current_project_scores scores on scores.project_id = projects.id
left join market_observations observations on observations.id = scores.market_observation_id
where projects.status = 'active';

grant select on current_scores, public_project_details to anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on current_scores, public_project_details to authenticated';
  end if;
end;
$$;
