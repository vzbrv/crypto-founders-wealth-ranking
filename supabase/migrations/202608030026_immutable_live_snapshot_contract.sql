-- Make every published snapshot and its child rows immutable, expose only
-- complete publications, and include the presentation identity needed by the
-- live leaderboard without consulting the bundled research document.

create or replace function public.prevent_immutable_hourly_snapshot_child_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_snapshot_id uuid;
  v_old_snapshot_id uuid;
begin
  if tg_op = 'DELETE' then
    v_snapshot_id := old.snapshot_id;
  else
    v_snapshot_id := new.snapshot_id;
  end if;

  if tg_op = 'UPDATE' then
    v_old_snapshot_id := old.snapshot_id;
  end if;

  if exists (
    select 1
    from public.hourly_snapshots snapshot
    where snapshot.id in (v_snapshot_id, v_old_snapshot_id)
      and snapshot.is_immutable
  ) then
    raise exception 'immutable hourly snapshot children cannot be modified';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists hourly_snapshot_inputs_immutable_mutation on public.hourly_snapshot_inputs;
create trigger hourly_snapshot_inputs_immutable_mutation
before insert or update or delete on public.hourly_snapshot_inputs
for each row execute function public.prevent_immutable_hourly_snapshot_child_mutation();

drop trigger if exists hourly_snapshot_results_immutable_mutation on public.hourly_snapshot_results;
create trigger hourly_snapshot_results_immutable_mutation
before insert or update or delete on public.hourly_snapshot_results
for each row execute function public.prevent_immutable_hourly_snapshot_child_mutation();

drop trigger if exists hourly_snapshot_sources_immutable_mutation on public.hourly_snapshot_sources;
create trigger hourly_snapshot_sources_immutable_mutation
before insert or update or delete on public.hourly_snapshot_sources
for each row execute function public.prevent_immutable_hourly_snapshot_child_mutation();

drop trigger if exists hourly_snapshot_provider_health_immutable_mutation on public.hourly_snapshot_provider_health;
create trigger hourly_snapshot_provider_health_immutable_mutation
before insert or update or delete on public.hourly_snapshot_provider_health
for each row execute function public.prevent_immutable_hourly_snapshot_child_mutation();

update public.hourly_snapshots snapshot
set is_immutable = true,
    updated_at = now()
where snapshot.status = 'published'
  and not snapshot.is_immutable
  and (select count(*) from public.hourly_snapshot_results result
       where result.snapshot_id = snapshot.id) = 20
  and exists (select 1 from public.hourly_snapshot_sources source
              where source.snapshot_id = snapshot.id);

create or replace function public.publish_hourly_snapshot(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot_id uuid;
  v_existing_status text;
  v_existing_immutable boolean;
  v_utc_hour timestamptz;
  v_previous_snapshot_id uuid;
  v_updated_rows integer;
  v_results jsonb := coalesce(p_payload->'results', '[]'::jsonb);
  v_sources jsonb := coalesce(p_payload->'sources', '[]'::jsonb);
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'snapshot payload must be an object';
  end if;
  v_utc_hour := (p_payload->>'utc_hour')::timestamptz;
  if date_trunc('hour', v_utc_hour) <> v_utc_hour then
    raise exception 'snapshot utc_hour must be truncated to an hour';
  end if;
  if jsonb_array_length(v_results) <> 20 then
    raise exception 'partial ranking cannot be published';
  end if;
  if jsonb_array_length(v_sources) = 0 then
    raise exception 'snapshot sources are required';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_sources) as source(
      source_id text, source_url text, source_name text, observed_at timestamptz,
      fetched_at timestamptz, metadata jsonb
    )
    where source_id is null or source_url is null or source_url not like 'https://%'
      or source_name is null or observed_at is null or fetched_at is null
  ) then
    raise exception 'every source requires a safe URL and timestamps';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_results) as result(
      entry_id text, rank integer, final_value_usd numeric, calculation jsonb
    )
    where nullif(btrim(result.entry_id), '') is null
      or result.rank is null
      or result.final_value_usd is null
      or result.calculation is null
      or jsonb_typeof(result.calculation) <> 'object'
      or nullif(btrim(result.calculation->>'founderTeam'), '') is null
      or nullif(btrim(result.calculation->>'project'), '') is null
  ) then
    raise exception 'every result requires display identity, rank, and final value';
  end if;
  if (select count(*) from jsonb_to_recordset(v_results) as result(rank integer)
      where result.rank between 1 and 20) <> 20
     or (select count(distinct result.rank) from jsonb_to_recordset(v_results) as result(rank integer)) <> 20
     or (select count(distinct result.entry_id) from jsonb_to_recordset(v_results) as result(entry_id text)) <> 20 then
    raise exception 'ranks and entry IDs must be unique and complete';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(v_results) as result(source_ids jsonb)
    where jsonb_array_length(coalesce(result.source_ids, '[]'::jsonb)) = 0
       or exists (
         select 1
         from jsonb_array_elements_text(coalesce(result.source_ids, '[]'::jsonb)) as source_id
         where not exists (
           select 1 from jsonb_array_elements(v_sources) as source
           where source->>'source_id' = source_id
         )
       )
  ) then
    raise exception 'every result must reference known source records';
  end if;

  select id, status, is_immutable
  into v_snapshot_id, v_existing_status, v_existing_immutable
  from public.hourly_snapshots
  where utc_hour = v_utc_hour
  for update;

  if v_existing_status = 'published' and v_existing_immutable then
    if (select count(*) from public.hourly_snapshot_results result
        where result.snapshot_id = v_snapshot_id) = 20
       and exists (select 1 from public.hourly_snapshot_sources source
                   where source.snapshot_id = v_snapshot_id) then
      return v_snapshot_id;
    end if;
    raise exception 'immutable published snapshot is incomplete';
  end if;

  select snapshot.id into v_previous_snapshot_id
  from public.hourly_snapshots snapshot
  where snapshot.status = 'published'
    and snapshot.is_immutable
    and snapshot.utc_hour < v_utc_hour
    and (select count(*) from public.hourly_snapshot_results previous_results
         where previous_results.snapshot_id = snapshot.id) = 20
    and exists (select 1 from public.hourly_snapshot_sources previous_source
                where previous_source.snapshot_id = snapshot.id)
  order by snapshot.publication_at desc nulls last, snapshot.utc_hour desc
  limit 1;

  if v_snapshot_id is null then
    v_snapshot_id := coalesce((p_payload->>'snapshot_id')::uuid, gen_random_uuid());
    insert into public.hourly_snapshots (
      id, utc_hour, observation_at, publication_at, status, calculation_version,
      ranking_mode, is_immutable, provider_health, failure_reason
    ) values (
      v_snapshot_id,
      v_utc_hour,
      (p_payload->>'observation_at')::timestamptz,
      now(),
      'published',
      coalesce(nullif(p_payload->>'calculation_version', ''), 'unknown'),
      coalesce(nullif(p_payload->>'ranking_mode', ''), 'normalized'),
      false,
      coalesce(p_payload->'provider_health', '{}'::jsonb),
      null
    );
  else
    update public.hourly_snapshots
    set observation_at = (p_payload->>'observation_at')::timestamptz,
        publication_at = now(),
        updated_at = now(),
        status = 'published',
        calculation_version = coalesce(nullif(p_payload->>'calculation_version', ''), calculation_version),
        ranking_mode = coalesce(nullif(p_payload->>'ranking_mode', ''), ranking_mode),
        provider_health = coalesce(p_payload->'provider_health', '{}'::jsonb),
        failure_reason = null
    where id = v_snapshot_id and not is_immutable;
    get diagnostics v_updated_rows = row_count;
    if v_updated_rows <> 1 then
      raise exception 'snapshot is immutable and cannot be retried';
    end if;

    delete from public.hourly_snapshot_inputs where snapshot_id = v_snapshot_id;
    delete from public.hourly_snapshot_results where snapshot_id = v_snapshot_id;
    delete from public.hourly_snapshot_sources where snapshot_id = v_snapshot_id;
    delete from public.hourly_snapshot_provider_health where snapshot_id = v_snapshot_id;
  end if;

  insert into public.hourly_snapshot_sources (
    snapshot_id, source_id, source_url, source_name, observed_at, fetched_at, metadata
  )
  select v_snapshot_id, source_id, source_url, source_name, observed_at, fetched_at,
    coalesce(metadata, '{}'::jsonb)
  from jsonb_to_recordset(v_sources) as source(
    source_id text, source_url text, source_name text, observed_at timestamptz,
    fetched_at timestamptz, metadata jsonb
  );

  insert into public.hourly_snapshot_results (
    snapshot_id, entry_id, rank, value_type, gross_value_usd, final_value_usd,
    confidence_score, confidence_label, calculation, source_ids,
    previous_rank, rank_change, rank_change_status
  )
  select v_snapshot_id, result.entry_id, result.rank, result.value_type,
    result.gross_value_usd, result.final_value_usd, result.confidence_score,
    result.confidence_label, result.calculation,
    coalesce(result.source_ids, '[]'::jsonb), previous.rank,
    case when previous.rank is null then null else previous.rank - result.rank end,
    case when v_previous_snapshot_id is null then 'baseline'
         when previous.rank is null then 'new'
         else 'continued' end
  from jsonb_to_recordset(v_results) as result(
    entry_id text, rank integer, value_type text, gross_value_usd numeric,
    final_value_usd numeric, confidence_score numeric, confidence_label text,
    calculation jsonb, source_ids jsonb
  )
  left join public.hourly_snapshot_results previous
    on previous.snapshot_id = v_previous_snapshot_id
   and previous.entry_id = result.entry_id;

  insert into public.hourly_snapshot_inputs (
    snapshot_id, entry_id, value_type, token_price_usd, circulating_supply,
    public_company_price_usd, share_count_inputs, founder_affiliate_deduction_usd,
    outside_capital_deduction_usd, gross_value_usd, original_observation_at,
    data_age_seconds, max_staleness_seconds, freshness_status, source_ids, metadata
  )
  select v_snapshot_id, entry_id, value_type, token_price_usd, circulating_supply,
    public_company_price_usd, coalesce(share_count_inputs, '{}'::jsonb),
    founder_affiliate_deduction_usd, outside_capital_deduction_usd, gross_value_usd,
    original_observation_at, data_age_seconds, max_staleness_seconds,
    coalesce(freshness_status, 'current'), coalesce(source_ids, '[]'::jsonb),
    coalesce(metadata, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_payload->'inputs', '[]'::jsonb)) as input(
    entry_id text, value_type text, token_price_usd numeric, circulating_supply numeric,
    public_company_price_usd numeric, share_count_inputs jsonb,
    founder_affiliate_deduction_usd numeric, outside_capital_deduction_usd numeric,
    gross_value_usd numeric, original_observation_at timestamptz,
    data_age_seconds integer, max_staleness_seconds integer, freshness_status text,
    source_ids jsonb, metadata jsonb
  );

  insert into public.hourly_snapshot_provider_health (
    snapshot_id, provider, checked_at, status, freshness, error_code, safe_message
  )
  select v_snapshot_id, provider, checked_at, status, coalesce(freshness, 'current'),
    error_code, safe_message
  from jsonb_to_recordset(coalesce(p_payload->'provider_health_records', '[]'::jsonb)) as health(
    provider text, checked_at timestamptz, status text, freshness text,
    error_code text, safe_message text
  );

  if (select count(*) from public.hourly_snapshot_results result
      where result.snapshot_id = v_snapshot_id) <> 20
     or not exists (select 1 from public.hourly_snapshot_sources source
                    where source.snapshot_id = v_snapshot_id) then
    raise exception 'complete snapshot verification failed';
  end if;

  update public.hourly_snapshots
  set is_immutable = true,
      updated_at = now()
  where id = v_snapshot_id and not is_immutable;

  return v_snapshot_id;
end;
$$;

create or replace view public.current_published_snapshot as
select snapshot.id, snapshot.utc_hour, snapshot.observation_at,
  snapshot.publication_at, snapshot.updated_at, snapshot.status,
  snapshot.calculation_version, snapshot.is_immutable, snapshot.provider_health,
  snapshot.failure_reason, snapshot.created_at, snapshot.ranking_mode
from public.hourly_snapshots snapshot
where snapshot.status = 'published'
  and snapshot.is_immutable
  and (select count(*) from public.hourly_snapshot_results result
       where result.snapshot_id = snapshot.id) = 20
  and exists (select 1 from public.hourly_snapshot_sources source
              where source.snapshot_id = snapshot.id)
order by snapshot.publication_at desc nulls last
limit 1;

create or replace view public.public_current_snapshot_results as
select results.snapshot_id, results.entry_id, results.rank, results.rank_change,
  results.value_type, results.gross_value_usd, results.final_value_usd,
  results.confidence_score, results.confidence_label, results.calculation,
  results.source_ids, snapshot.utc_hour, snapshot.observation_at,
  snapshot.publication_at,
  case when snapshot.observation_at < now() - interval '90 minutes'
       then 'stale' else 'current' end as freshness_status,
  results.previous_rank, results.rank_change_status,
  coalesce(nullif(results.calculation->>'founderTeam', ''),
           nullif(inputs.metadata->>'founderTeam', '')) as founder_team,
  coalesce(nullif(results.calculation->>'project', ''),
           nullif(inputs.metadata->>'project', '')) as project,
  coalesce(results.calculation->'market', inputs.metadata->'market') as market,
  case lower(coalesce(results.calculation->>'upperEstimate',
                      inputs.metadata->>'upperEstimate', 'false'))
    when 'true' then true else false
  end as upper_estimate
from public.hourly_snapshot_results results
join public.current_published_snapshot snapshot on snapshot.id = results.snapshot_id
left join public.hourly_snapshot_inputs inputs
  on inputs.snapshot_id = results.snapshot_id and inputs.entry_id = results.entry_id
order by results.rank;

create or replace view public.public_historical_snapshots as
select snapshot.id, snapshot.utc_hour, snapshot.observation_at,
  snapshot.publication_at, snapshot.status, snapshot.calculation_version,
  snapshot.is_immutable, snapshot.provider_health, snapshot.failure_reason
from public.historical_snapshots snapshot
where snapshot.status = 'published'
  and snapshot.is_immutable
  and (select count(*) from public.hourly_snapshot_results result
       where result.snapshot_id = snapshot.id) = 20
  and exists (select 1 from public.hourly_snapshot_sources source
              where source.snapshot_id = snapshot.id);

create or replace view public.public_historical_snapshot_results as
with complete_snapshots as (
  select snapshot.*
  from public.historical_snapshots snapshot
  where snapshot.status = 'published'
    and snapshot.is_immutable
    and (select count(*) from public.hourly_snapshot_results result
         where result.snapshot_id = snapshot.id) = 20
    and exists (select 1 from public.hourly_snapshot_sources source
                where source.snapshot_id = snapshot.id)
), current_rows as (
  select results.snapshot_id, snapshot.utc_hour, snapshot.publication_at,
    results.entry_id, results.rank, results.previous_rank, results.rank_change,
    results.rank_change_status, results.final_value_usd, results.value_type
  from public.hourly_snapshot_results results
  join complete_snapshots snapshot on snapshot.id = results.snapshot_id
), out_rows as (
  select current_snapshot.id as snapshot_id,
    current_snapshot.utc_hour, current_snapshot.publication_at,
    previous_result.entry_id, null::integer as rank,
    previous_result.rank as previous_rank, null::integer as rank_change,
    'out'::text as rank_change_status, null::numeric as final_value_usd,
    previous_result.value_type
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

create or replace view public.public_latest_snapshot_status as
select snapshot.id, snapshot.utc_hour, snapshot.observation_at,
  snapshot.publication_at, snapshot.status, snapshot.calculation_version,
  snapshot.provider_health, snapshot.failure_reason, snapshot.created_at,
  snapshot.updated_at, snapshot.is_immutable
from public.hourly_snapshots snapshot
order by coalesce(snapshot.publication_at, snapshot.created_at) desc
limit 1;

grant select on public.public_current_published_snapshot,
  public.public_current_snapshot_results, public.public_current_snapshot_inputs,
  public.public_snapshot_sources, public.public_current_snapshot_provider_health,
  public.public_historical_snapshots, public.public_historical_snapshot_results,
  public.public_latest_snapshot_status to anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on public.public_current_published_snapshot, public.public_current_snapshot_results, public.public_current_snapshot_inputs, public.public_snapshot_sources, public.public_current_snapshot_provider_health, public.public_historical_snapshots, public.public_historical_snapshot_results, public.public_latest_snapshot_status to authenticated';
  end if;
end;
$$;

comment on function public.publish_hourly_snapshot(jsonb) is
  'Atomically publishes one complete self-contained hourly ranking, then permanently seals its parent and child rows.';
