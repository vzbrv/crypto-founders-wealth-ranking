-- Phase 10: sanitize public provider health and retain bounded raw telemetry.

drop policy if exists public_read_provider_health on provider_health;
revoke select on provider_health from anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke select on provider_health from authenticated';
  end if;
end;
$$;

create or replace view public_provider_status
with (security_barrier = true)
as
select distinct on (provider)
  provider,
  checked_at,
  status,
  latency_ms,
  case
    when checked_at >= now() - interval '20 minutes' then 'current'
    else 'stale'
  end as freshness
from provider_health
order by provider, checked_at desc, id desc;

revoke all on public_provider_status from public, anon;
grant select on public_provider_status to anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on public_provider_status from authenticated';
    execute 'grant select on public_provider_status to authenticated';
  end if;
end;
$$;

comment on view public_provider_status is
  'Latest sanitized provider state. Raw diagnostics remain service-role-only.';

create or replace function run_observation_retention(
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  deleted_market integer;
  deleted_wallet integer;
  deleted_health integer;
begin
  delete from market_observations observation
  where observation.observed_at < p_now - interval '30 days'
    and exists (
      select 1
      from market_observations newer
      where newer.asset_id = observation.asset_id
        and newer.provider = observation.provider
        and (newer.observed_at, newer.id) > (observation.observed_at, observation.id)
    );
  get diagnostics deleted_market = row_count;

  delete from wallet_balance_observations observation
  where observation.observed_at < p_now - interval '30 days'
    and exists (
      select 1
      from wallet_balance_observations newer
      where newer.tracked_wallet_id = observation.tracked_wallet_id
        and newer.asset_id = observation.asset_id
        and newer.provider = observation.provider
        and (newer.observed_at, newer.id) > (observation.observed_at, observation.id)
    );
  get diagnostics deleted_wallet = row_count;

  delete from provider_health health
  where health.checked_at < p_now - interval '30 days'
    and exists (
      select 1
      from provider_health newer
      where newer.provider = health.provider
        and (newer.checked_at, newer.id) > (health.checked_at, health.id)
    );
  get diagnostics deleted_health = row_count;

  return jsonb_build_object(
    'marketObservations', deleted_market,
    'walletObservations', deleted_wallet,
    'providerHealth', deleted_health
  );
end;
$$;

revoke all on function run_observation_retention(timestamptz)
  from public, anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function run_observation_retention(timestamptz) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function run_observation_retention(timestamptz) to service_role';
  end if;
end;
$$;

comment on function run_observation_retention(timestamptz) is
  'Deletes raw telemetry older than 30 days while preserving the latest row per provider or subject.';
