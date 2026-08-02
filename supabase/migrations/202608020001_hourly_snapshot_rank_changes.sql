alter table public.hourly_snapshot_results
  add column if not exists rank_change integer;

create or replace function public.publish_hourly_snapshot(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_snapshot_id uuid;
  v_existing_status text;
  v_utc_hour timestamptz;
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
    from jsonb_to_recordset(v_results) as result(rank integer, final_value_usd numeric, source_ids jsonb)
    where result.rank is null or result.final_value_usd is null
  ) then
    raise exception 'every result requires a rank and final value';
  end if;
  if (select count(*) from jsonb_to_recordset(v_results) as result(rank integer)
      where result.rank between 1 and 20) <> 20
     or (select count(distinct result.rank) from jsonb_to_recordset(v_results) as result(rank integer)) <> 20 then
    raise exception 'ranks must be unique and contiguous';
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

  select id, status into v_snapshot_id, v_existing_status
  from hourly_snapshots
  where utc_hour = v_utc_hour
  for update;

  if v_existing_status = 'published' then
    return v_snapshot_id;
  end if;

  if v_snapshot_id is null then
    v_snapshot_id := coalesce((p_payload->>'snapshot_id')::uuid, gen_random_uuid());
    insert into hourly_snapshots (
      id, utc_hour, observation_at, publication_at, status, calculation_version,
      provider_health, failure_reason
    ) values (
      v_snapshot_id,
      v_utc_hour,
      (p_payload->>'observation_at')::timestamptz,
      now(),
      'published',
      coalesce(nullif(p_payload->>'calculation_version', ''), 'unknown'),
      coalesce(p_payload->'provider_health', '{}'::jsonb),
      null
    );
  else
    delete from hourly_snapshot_inputs where snapshot_id = v_snapshot_id;
    delete from hourly_snapshot_results where snapshot_id = v_snapshot_id;
    delete from hourly_snapshot_sources where snapshot_id = v_snapshot_id;
    delete from hourly_snapshot_provider_health where snapshot_id = v_snapshot_id;
    update hourly_snapshots
    set observation_at = (p_payload->>'observation_at')::timestamptz,
        publication_at = now(),
        updated_at = now(),
        status = 'published',
        calculation_version = coalesce(nullif(p_payload->>'calculation_version', ''), calculation_version),
        provider_health = coalesce(p_payload->'provider_health', '{}'::jsonb),
        failure_reason = null
    where id = v_snapshot_id and not is_immutable;
  end if;

  insert into hourly_snapshot_sources (
    snapshot_id, source_id, source_url, source_name, observed_at, fetched_at, metadata
  )
  select v_snapshot_id, source_id, source_url, source_name, observed_at, fetched_at,
    coalesce(metadata, '{}'::jsonb)
  from jsonb_to_recordset(v_sources) as source(
    source_id text, source_url text, source_name text, observed_at timestamptz,
    fetched_at timestamptz, metadata jsonb
  );

  insert into hourly_snapshot_results (
    snapshot_id, entry_id, rank, rank_change, value_type, gross_value_usd, final_value_usd,
    confidence_score, confidence_label, calculation, source_ids
  )
  select v_snapshot_id, entry_id, rank, rank_change, value_type, gross_value_usd, final_value_usd,
    confidence_score, confidence_label, coalesce(calculation, '{}'::jsonb), coalesce(source_ids, '[]'::jsonb)
  from jsonb_to_recordset(v_results) as result(
    entry_id text, rank integer, rank_change integer, value_type text, gross_value_usd numeric,
    final_value_usd numeric, confidence_score numeric, confidence_label text,
    calculation jsonb, source_ids jsonb
  );

  insert into hourly_snapshot_inputs (
    snapshot_id, entry_id, value_type, token_price_usd, circulating_supply,
    public_company_price_usd, share_count_inputs, founder_affiliate_deduction_usd,
    outside_capital_deduction_usd, gross_value_usd, original_observation_at,
    data_age_seconds, max_staleness_seconds, freshness_status, source_ids, metadata
  )
  select v_snapshot_id, entry_id, value_type, token_price_usd, circulating_supply,
    public_company_price_usd, coalesce(share_count_inputs, '{}'::jsonb),
    founder_affiliate_deduction_usd, outside_capital_deduction_usd, gross_value_usd,
    original_observation_at, data_age_seconds, max_staleness_seconds,
    coalesce(freshness_status, 'current'), coalesce(source_ids, '[]'::jsonb), coalesce(metadata, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_payload->'inputs', '[]'::jsonb)) as input(
    entry_id text, value_type text, token_price_usd numeric, circulating_supply numeric,
    public_company_price_usd numeric, share_count_inputs jsonb,
    founder_affiliate_deduction_usd numeric, outside_capital_deduction_usd numeric,
    gross_value_usd numeric, original_observation_at timestamptz,
    data_age_seconds integer, max_staleness_seconds integer, freshness_status text,
    source_ids jsonb, metadata jsonb
  );

  insert into hourly_snapshot_provider_health (
    snapshot_id, provider, checked_at, status, freshness, error_code, safe_message
  )
  select v_snapshot_id, provider, checked_at, status, coalesce(freshness, 'current'), error_code, safe_message
  from jsonb_to_recordset(coalesce(p_payload->'provider_health_records', '[]'::jsonb)) as health(
    provider text, checked_at timestamptz, status text, freshness text,
    error_code text, safe_message text
  );

  return v_snapshot_id;
end;
$$;

revoke all on function public.publish_hourly_snapshot(jsonb) from public, anon, authenticated;
grant execute on function public.publish_hourly_snapshot(jsonb) to service_role;

drop view if exists public.public_current_snapshot_results;
create view public.public_current_snapshot_results as
select results.snapshot_id, results.entry_id, results.rank, results.rank_change, results.value_type,
  results.gross_value_usd, results.final_value_usd, results.confidence_score,
  results.confidence_label, results.calculation, results.source_ids,
  snapshot.utc_hour, snapshot.observation_at, snapshot.publication_at,
  case when snapshot.observation_at < now() - interval '90 minutes' then 'stale' else 'current' end as freshness_status
from hourly_snapshot_results results
join current_published_snapshot snapshot on snapshot.id = results.snapshot_id
order by results.rank;

grant select on public.public_current_snapshot_results to anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on public.public_current_snapshot_results to authenticated';
  end if;
end;
$$;

comment on column public.hourly_snapshot_results.rank_change is
  'Canonical rank movement from the prior recalculated leaderboard; positive means moved up.';
