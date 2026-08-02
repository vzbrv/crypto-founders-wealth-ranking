-- Free-tier-only provider quotas. This migration contains no billing or paid-plan path.

create table if not exists provider_quota_config (
  provider text primary key,
  plan text not null default 'free_demo' check (plan = 'free_demo'),
  documented_monthly_quota integer not null check (documented_monthly_quota > 0),
  hard_monthly_request_limit integer not null
    check (hard_monthly_request_limit > 0 and hard_monthly_request_limit < documented_monthly_quota),
  estimated_monthly_requests integer not null check (estimated_monthly_requests >= 0),
  max_requests_per_run integer not null default 1 check (max_requests_per_run > 0),
  provider_docs_url text not null check (provider_docs_url like 'https://%'),
  updates_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into provider_quota_config (
  provider, plan, documented_monthly_quota, hard_monthly_request_limit,
  estimated_monthly_requests, max_requests_per_run, provider_docs_url
) values (
  'coingecko', 'free_demo', 10000, 9000, 744, 1,
  'https://www.coingecko.com/en/api/pricing'
)
on conflict (provider) do nothing;

create table if not exists provider_usage_monthly (
  provider text not null references provider_quota_config(provider),
  month_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  request_limit integer not null check (request_limit > 0),
  estimated_monthly_requests integer not null default 0 check (estimated_monthly_requests >= 0),
  last_request_at timestamptz,
  paused_at timestamptz,
  pause_reason text,
  status text not null default 'active' check (status in ('active', 'paused')),
  manual_resume_required boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (provider, month_start)
);

create table if not exists provider_usage_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null references provider_quota_config(provider),
  month_start timestamptz not null,
  requested_count integer not null check (requested_count > 0),
  endpoint text not null,
  outcome text not null check (outcome in ('reserved', 'blocked', 'permanent_stop')),
  observed_at timestamptz not null default now(),
  reason text
);

create table if not exists hourly_update_control (
  id boolean primary key default true check (id),
  updates_enabled boolean not null default true,
  status text not null default 'Active'
    check (status in ('Active', 'Paused — provider quota exhausted', 'Paused — manual intervention required')),
  paused_provider text,
  paused_condition text,
  paused_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into hourly_update_control (id) values (true)
on conflict (id) do nothing;

create or replace function public.disable_hourly_ranking_updates(
  p_provider text,
  p_condition text,
  p_paused_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update provider_quota_config
  set updates_enabled = false, updated_at = now()
  where provider = p_provider;

  update provider_usage_monthly
  set status = 'paused', paused_at = p_paused_at, pause_reason = p_condition,
      manual_resume_required = true, updated_at = now()
  where provider = p_provider
    and month_start = date_trunc('month', p_paused_at at time zone 'UTC') at time zone 'UTC';

  insert into hourly_update_control (
    id, updates_enabled, status, paused_provider, paused_condition, paused_at, updated_at
  ) values (
    true, false, 'Paused — provider quota exhausted', p_provider, p_condition, p_paused_at, now()
  )
  on conflict (id) do update set
    updates_enabled = false,
    status = 'Paused — provider quota exhausted',
    paused_provider = excluded.paused_provider,
    paused_condition = excluded.paused_condition,
    paused_at = excluded.paused_at,
    updated_at = now();

  -- Supabase hosted environments have pg_cron; local migration tests do not.
  begin
    execute 'select cron.unschedule($1)' using 'hourly-ranking-snapshot';
  exception
    when sqlstate '3F000' or undefined_function or undefined_table or insufficient_privilege then
      null;
  end;
end;
$$;

create or replace function public.reserve_provider_request(
  p_provider text,
  p_request_count integer,
  p_endpoint text,
  p_requested_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_config provider_quota_config%rowtype;
  v_usage provider_usage_monthly%rowtype;
  v_month_start timestamptz := date_trunc('month', p_requested_at at time zone 'UTC') at time zone 'UTC';
begin
  if p_request_count is null or p_request_count <= 0 or p_endpoint is null or p_endpoint = '' then
    raise exception 'invalid provider request reservation';
  end if;

  select * into v_config from provider_quota_config where provider = p_provider for update;
  if not found then raise exception 'provider quota configuration is missing'; end if;

  insert into provider_usage_monthly (
    provider, month_start, request_limit, estimated_monthly_requests
  ) values (
    p_provider, v_month_start, v_config.hard_monthly_request_limit,
    v_config.estimated_monthly_requests
  ) on conflict (provider, month_start) do nothing;

  select * into v_usage
  from provider_usage_monthly
  where provider = p_provider and month_start = v_month_start
  for update;

  if not v_config.updates_enabled or not coalesce(
    (select updates_enabled from hourly_update_control where id = true), false
  ) then
    insert into provider_usage_events (provider, month_start, requested_count, endpoint, outcome, reason)
    values (p_provider, v_month_start, p_request_count, p_endpoint, 'blocked', 'updates_paused');
    return jsonb_build_object(
      'allowed', false, 'code', 'UPDATES_PAUSED',
      'status', 'Paused — provider quota exhausted', 'provider', p_provider,
      'condition', coalesce(v_usage.pause_reason, 'updates_paused')
    );
  end if;

  if p_request_count > v_config.max_requests_per_run
     or v_usage.request_count + p_request_count > v_config.hard_monthly_request_limit then
    perform public.disable_hourly_ranking_updates(
      p_provider,
      case when p_request_count > v_config.max_requests_per_run
        then 'REQUEST_BATCH_LIMIT_EXCEEDED' else 'MONTHLY_QUOTA_EXHAUSTED' end,
      p_requested_at
    );
    insert into provider_usage_events (provider, month_start, requested_count, endpoint, outcome, reason)
    values (p_provider, v_month_start, p_request_count, p_endpoint, 'blocked', 'quota_exhausted');
    return jsonb_build_object(
      'allowed', false, 'code', 'PROVIDER_QUOTA_EXHAUSTED',
      'status', 'Paused — provider quota exhausted', 'provider', p_provider,
      'condition', case when p_request_count > v_config.max_requests_per_run
        then 'REQUEST_BATCH_LIMIT_EXCEEDED' else 'MONTHLY_QUOTA_EXHAUSTED' end
    );
  end if;

  update provider_usage_monthly
  set request_count = request_count + p_request_count,
      request_limit = v_config.hard_monthly_request_limit,
      estimated_monthly_requests = v_config.estimated_monthly_requests,
      last_request_at = p_requested_at,
      updated_at = now()
  where provider = p_provider and month_start = v_month_start;
  insert into provider_usage_events (provider, month_start, requested_count, endpoint, outcome)
  values (p_provider, v_month_start, p_request_count, p_endpoint, 'reserved');

  return jsonb_build_object(
    'allowed', true, 'provider', p_provider, 'month_start', v_month_start,
    'request_count', v_usage.request_count + p_request_count,
    'remaining', v_config.hard_monthly_request_limit - v_usage.request_count - p_request_count
  );
end;
$$;

create or replace function public.record_provider_quota_stop(
  p_provider text,
  p_condition text,
  p_paused_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.disable_hourly_ranking_updates(p_provider, p_condition, p_paused_at);
  insert into provider_usage_events (
    provider, month_start, requested_count, endpoint, outcome, observed_at, reason
  ) values (
    p_provider,
    date_trunc('month', p_paused_at at time zone 'UTC') at time zone 'UTC',
    1,
    '/coins/markets',
    'permanent_stop',
    p_paused_at,
    p_condition
  );
end;
$$;

create or replace function public.resume_provider_updates(
  p_provider text,
  p_confirmation text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if upper(coalesce(p_confirmation, '')) <> 'MANUAL_RESUME' then
    raise exception 'explicit manual resume confirmation is required';
  end if;

  update provider_quota_config
  set updates_enabled = true, updated_at = now()
  where provider = p_provider;
  update provider_usage_monthly
  set status = 'active', paused_at = null, pause_reason = null,
      manual_resume_required = false, updated_at = now()
  where provider = p_provider
    and month_start = date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
  update hourly_update_control
  set updates_enabled = true, status = 'Active', paused_provider = null,
      paused_condition = null, paused_at = null, updated_at = now()
  where id = true;
end;
$$;

create or replace view public.public_provider_quota_status as
select
  config.provider,
  config.plan,
  config.provider_docs_url,
  config.documented_monthly_quota,
  config.hard_monthly_request_limit,
  config.estimated_monthly_requests,
  coalesce(usage.request_count, 0) as monthly_request_count,
  greatest(config.hard_monthly_request_limit - coalesce(usage.request_count, 0), 0) as remaining_requests,
  case when not control.updates_enabled then control.status
    when usage.status = 'paused' then 'Paused — provider quota exhausted'
    else 'Active' end as status,
  usage.pause_reason,
  usage.paused_at,
  usage.last_request_at,
  control.updates_enabled as scheduled_updates_enabled,
  control.paused_provider,
  control.paused_condition,
  control.paused_at as scheduler_paused_at
from provider_quota_config config
cross join hourly_update_control control
left join provider_usage_monthly usage
  on usage.provider = config.provider
 and usage.month_start = date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';

alter table provider_quota_config enable row level security;
alter table provider_usage_monthly enable row level security;
alter table provider_usage_events enable row level security;
alter table hourly_update_control enable row level security;

revoke all on provider_quota_config, provider_usage_monthly, provider_usage_events, hourly_update_control from public, authenticated;
revoke all on function public.disable_hourly_ranking_updates(text, text, timestamptz) from public, authenticated;
revoke all on function public.reserve_provider_request(text, integer, text, timestamptz) from public, authenticated;
revoke all on function public.record_provider_quota_stop(text, text, timestamptz) from public, authenticated;
revoke all on function public.resume_provider_updates(text, text) from public, authenticated;
grant select on public.public_provider_quota_status to anon, authenticated;
grant execute on function public.disable_hourly_ranking_updates(text, text, timestamptz) to service_role;
grant execute on function public.reserve_provider_request(text, integer, text, timestamptz) to service_role;
grant execute on function public.record_provider_quota_stop(text, text, timestamptz) to service_role;
grant execute on function public.resume_provider_updates(text, text) to service_role;
