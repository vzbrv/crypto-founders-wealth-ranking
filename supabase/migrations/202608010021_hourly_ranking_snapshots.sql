-- Immutable, transactionally published hourly snapshots.
-- The bundled July 30 baseline is retained as a historical-only row.

create table if not exists hourly_snapshots (
  id uuid primary key default gen_random_uuid(),
  utc_hour timestamptz not null unique,
  observation_at timestamptz not null,
  publication_at timestamptz,
  updated_at timestamptz not null default now(),
  status text not null check (status in ('published', 'failed')),
  calculation_version text not null,
  is_immutable boolean not null default false,
  provider_health jsonb not null default '{}'::jsonb,
  failure_reason text,
  created_at timestamptz not null default now()
);

alter table public.hourly_snapshots
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.prevent_immutable_hourly_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  if old.is_immutable then
    raise exception 'immutable hourly snapshot cannot be modified';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists hourly_snapshots_immutable_mutation on public.hourly_snapshots;
create trigger hourly_snapshots_immutable_mutation
before update or delete on public.hourly_snapshots
for each row execute function public.prevent_immutable_hourly_snapshot_mutation();

create table if not exists hourly_snapshot_inputs (
  snapshot_id uuid not null references hourly_snapshots(id) on delete cascade,
  entry_id text not null,
  value_type text not null check (value_type in ('Token/network', 'Public company')),
  token_price_usd numeric,
  circulating_supply numeric,
  public_company_price_usd numeric,
  share_count_inputs jsonb not null default '{}'::jsonb,
  founder_affiliate_deduction_usd numeric,
  outside_capital_deduction_usd numeric,
  gross_value_usd numeric,
  original_observation_at timestamptz,
  data_age_seconds integer,
  max_staleness_seconds integer,
  freshness_status text not null check (freshness_status in ('current', 'stale', 'historical')),
  source_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  primary key (snapshot_id, entry_id)
);

create table if not exists hourly_snapshot_results (
  snapshot_id uuid not null references hourly_snapshots(id) on delete cascade,
  entry_id text not null,
  rank integer not null check (rank > 0),
  value_type text not null check (value_type in ('Token/network', 'Public company')),
  gross_value_usd numeric,
  final_value_usd numeric,
  confidence_score numeric not null,
  confidence_label text not null,
  calculation jsonb not null default '{}'::jsonb,
  source_ids jsonb not null default '[]'::jsonb,
  primary key (snapshot_id, entry_id),
  unique (snapshot_id, rank)
);

create table if not exists hourly_snapshot_sources (
  snapshot_id uuid not null references hourly_snapshots(id) on delete cascade,
  source_id text not null,
  source_url text not null,
  source_name text not null,
  observed_at timestamptz not null,
  fetched_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  primary key (snapshot_id, source_id)
);

create table if not exists hourly_snapshot_provider_health (
  snapshot_id uuid not null references hourly_snapshots(id) on delete cascade,
  provider text not null,
  checked_at timestamptz not null,
  status text not null,
  freshness text not null,
  error_code text,
  safe_message text,
  primary key (snapshot_id, provider)
);

insert into hourly_snapshots (
  id, utc_hour, observation_at, publication_at, status, calculation_version,
  is_immutable, provider_health
) values (
  '00000000-0000-4000-8000-202607300000',
  '2026-07-30T00:00:00Z',
  '2026-07-30T00:00:00Z',
  '2026-07-30T00:00:00Z',
  'published',
  'unified-v1',
  true,
  '{"baseline":true,"source":"bundled:data/research/unified-ranking.json"}'::jsonb
)
on conflict (utc_hour) do nothing;

create or replace function publish_hourly_snapshot(p_payload jsonb)
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
    snapshot_id, entry_id, rank, value_type, gross_value_usd, final_value_usd,
    confidence_score, confidence_label, calculation, source_ids
  )
  select v_snapshot_id, entry_id, rank, value_type, gross_value_usd, final_value_usd,
    confidence_score, confidence_label, coalesce(calculation, '{}'::jsonb), coalesce(source_ids, '[]'::jsonb)
  from jsonb_to_recordset(v_results) as result(
    entry_id text, rank integer, value_type text, gross_value_usd numeric,
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

revoke all on function publish_hourly_snapshot(jsonb) from public, anon, authenticated;
grant execute on function publish_hourly_snapshot(jsonb) to service_role;

create or replace function record_hourly_snapshot_failure(
  p_utc_hour timestamptz,
  p_provider text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into hourly_snapshots (
    utc_hour, observation_at, status, calculation_version, failure_reason, provider_health
  ) values (
    date_trunc('hour', p_utc_hour),
    p_utc_hour,
    'failed',
    'unified-v1',
    left(p_reason, 500),
    jsonb_build_object('provider', left(p_provider, 120), 'status', 'failed')
  )
  on conflict (utc_hour) do update
  set failure_reason = excluded.failure_reason,
      provider_health = excluded.provider_health,
      updated_at = now()
  where hourly_snapshots.status <> 'published';
end;
$$;

revoke all on function record_hourly_snapshot_failure(timestamptz, text, text) from public, anon, authenticated;
grant execute on function record_hourly_snapshot_failure(timestamptz, text, text) to service_role;

create view current_published_snapshot as
select * from hourly_snapshots
where status = 'published'
order by publication_at desc nulls last
limit 1;

create view public_current_published_snapshot as
select id, utc_hour, observation_at, publication_at, status, calculation_version,
  provider_health, failure_reason
from current_published_snapshot;

create view public_current_snapshot_results as
select results.snapshot_id, results.entry_id, results.rank, results.value_type,
  results.gross_value_usd, results.final_value_usd, results.confidence_score,
  results.confidence_label, results.calculation, results.source_ids,
  snapshot.utc_hour, snapshot.observation_at, snapshot.publication_at,
  case when snapshot.observation_at < now() - interval '90 minutes' then 'stale' else 'current' end as freshness_status
from hourly_snapshot_results results
join current_published_snapshot snapshot on snapshot.id = results.snapshot_id
order by results.rank;

create view public_current_snapshot_inputs as
select inputs.*, snapshot.utc_hour, snapshot.observation_at, snapshot.publication_at
from hourly_snapshot_inputs inputs
join current_published_snapshot snapshot on snapshot.id = inputs.snapshot_id;

create view public_snapshot_sources as
select sources.*
from hourly_snapshot_sources sources
join current_published_snapshot snapshot on snapshot.id = sources.snapshot_id;

create view public_current_snapshot_provider_health as
select health.*
from hourly_snapshot_provider_health health
join current_published_snapshot snapshot on snapshot.id = health.snapshot_id;

create view historical_snapshots as
select id, utc_hour, observation_at, publication_at, status, calculation_version,
  is_immutable, provider_health, failure_reason
from hourly_snapshots
order by utc_hour desc;

create view public_historical_snapshots as
select id, utc_hour, observation_at, publication_at, status, calculation_version,
  is_immutable, provider_health, failure_reason
from historical_snapshots
where status = 'published';

alter table hourly_snapshots enable row level security;
alter table hourly_snapshot_inputs enable row level security;
alter table hourly_snapshot_results enable row level security;
alter table hourly_snapshot_sources enable row level security;
alter table hourly_snapshot_provider_health enable row level security;

revoke all on hourly_snapshots, hourly_snapshot_inputs, hourly_snapshot_results,
  hourly_snapshot_sources, hourly_snapshot_provider_health from anon, authenticated;
grant select on public_current_published_snapshot, public_current_snapshot_results,
  public_current_snapshot_inputs,
  public_snapshot_sources, public_current_snapshot_provider_health,
  public_historical_snapshots to anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on public_current_published_snapshot, public_current_snapshot_results, public_current_snapshot_inputs, public_snapshot_sources, public_current_snapshot_provider_health, public_historical_snapshots to authenticated';
  end if;
end;
$$;

comment on table hourly_snapshots is 'One immutable published ranking per UTC hour, including the July 30 baseline.';
comment on function publish_hourly_snapshot(jsonb) is 'Validates and atomically publishes one complete hourly ranking; duplicate UTC hours are idempotent.';
