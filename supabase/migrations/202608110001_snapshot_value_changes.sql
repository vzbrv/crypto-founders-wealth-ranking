-- Expose value movement between complete immutable snapshots without mutating
-- sealed snapshot rows.

create or replace view public.public_current_snapshot_results as
with previous_snapshot as (
  select candidate.id
  from public.hourly_snapshots candidate
  join public.current_published_snapshot current_snapshot on true
  where candidate.status = 'published'
    and candidate.is_immutable
    and candidate.utc_hour < current_snapshot.utc_hour
    and (
      select count(*)
      from public.hourly_snapshot_results result
      where result.snapshot_id = candidate.id
    ) = 20
    and exists (
      select 1
      from public.hourly_snapshot_sources source
      where source.snapshot_id = candidate.id
    )
  order by candidate.publication_at desc nulls last, candidate.utc_hour desc
  limit 1
)
select
  results.snapshot_id,
  results.entry_id,
  results.rank,
  results.rank_change,
  results.value_type,
  results.gross_value_usd,
  results.final_value_usd,
  results.confidence_score,
  results.confidence_label,
  results.calculation,
  results.source_ids,
  snapshot.utc_hour,
  snapshot.observation_at,
  snapshot.publication_at,
  coalesce(
    inputs.freshness_status,
    case
      when snapshot.observation_at < now() - interval '90 minutes' then 'stale'
      else 'current'
    end
  ) as freshness_status,
  results.previous_rank,
  results.rank_change_status,
  coalesce(
    nullif(results.calculation->>'founderTeam', ''),
    nullif(inputs.metadata->>'founderTeam', '')
  ) as founder_team,
  coalesce(
    nullif(results.calculation->>'project', ''),
    nullif(inputs.metadata->>'project', '')
  ) as project,
  coalesce(results.calculation->'market', inputs.metadata->'market') as market,
  case lower(
    coalesce(
      results.calculation->>'upperEstimate',
      inputs.metadata->>'upperEstimate',
      'false'
    )
  )
    when 'true' then true
    else false
  end as upper_estimate,
  previous_result.final_value_usd as previous_final_value_usd,
  results.final_value_usd - previous_result.final_value_usd as value_change_usd
from public.hourly_snapshot_results results
join public.current_published_snapshot snapshot
  on snapshot.id = results.snapshot_id
left join public.hourly_snapshot_inputs inputs
  on inputs.snapshot_id = results.snapshot_id
 and inputs.entry_id = results.entry_id
left join previous_snapshot on true
left join public.hourly_snapshot_results previous_result
  on previous_result.snapshot_id = previous_snapshot.id
 and previous_result.entry_id = results.entry_id
order by results.rank;

create or replace view public.public_historical_snapshot_results as
with complete_snapshots as (
  select snapshot.*
  from public.historical_snapshots snapshot
  where snapshot.status = 'published'
    and snapshot.is_immutable
    and (
      select count(*)
      from public.hourly_snapshot_results result
      where result.snapshot_id = snapshot.id
    ) = 20
    and exists (
      select 1
      from public.hourly_snapshot_sources source
      where source.snapshot_id = snapshot.id
    )
),
current_rows as (
  select
    results.snapshot_id,
    snapshot.utc_hour,
    snapshot.publication_at,
    results.entry_id,
    results.rank,
    results.previous_rank,
    results.rank_change,
    results.rank_change_status,
    results.final_value_usd,
    results.value_type,
    previous_result.final_value_usd as previous_final_value_usd,
    results.final_value_usd - previous_result.final_value_usd as value_change_usd
  from public.hourly_snapshot_results results
  join complete_snapshots snapshot
    on snapshot.id = results.snapshot_id
  left join lateral (
    select previous_snapshot.id
    from complete_snapshots previous_snapshot
    where previous_snapshot.utc_hour < snapshot.utc_hour
    order by previous_snapshot.utc_hour desc
    limit 1
  ) previous_snapshot on true
  left join public.hourly_snapshot_results previous_result
    on previous_result.snapshot_id = previous_snapshot.id
   and previous_result.entry_id = results.entry_id
),
out_rows as (
  select
    current_snapshot.id as snapshot_id,
    current_snapshot.utc_hour,
    current_snapshot.publication_at,
    previous_result.entry_id,
    null::integer as rank,
    previous_result.rank as previous_rank,
    null::integer as rank_change,
    'out'::text as rank_change_status,
    null::numeric as final_value_usd,
    previous_result.value_type,
    previous_result.final_value_usd as previous_final_value_usd,
    null::numeric as value_change_usd
  from complete_snapshots current_snapshot
  join lateral (
    select previous_snapshot.id
    from complete_snapshots previous_snapshot
    where previous_snapshot.utc_hour < current_snapshot.utc_hour
    order by previous_snapshot.utc_hour desc
    limit 1
  ) previous_snapshot on true
  join public.hourly_snapshot_results previous_result
    on previous_result.snapshot_id = previous_snapshot.id
  left join public.hourly_snapshot_results current_result
    on current_result.snapshot_id = current_snapshot.id
   and current_result.entry_id = previous_result.entry_id
  where current_result.entry_id is null
)
select * from current_rows
union all
select * from out_rows
order by utc_hour desc, rank nulls last, entry_id;

grant select on public.public_current_snapshot_results to anon;
grant select on public.public_historical_snapshot_results to anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on public.public_current_snapshot_results to authenticated';
    execute 'grant select on public.public_historical_snapshot_results to authenticated';
  end if;
end
$$;

comment on view public.public_current_snapshot_results is
  'Current complete published immutable snapshot. value_change_usd compares final_value_usd with the matching entry in the prior complete snapshot.';

comment on view public.public_historical_snapshot_results is
  'Historical complete published immutable snapshots, including value movement from each prior complete snapshot.';
