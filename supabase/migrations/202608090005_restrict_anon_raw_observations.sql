-- Keep raw operational and wallet-source records behind the service role.
-- Public clients retain the deliberately filtered projections below.

alter view public.current_project_scores set (security_invoker = false);
alter view public.current_founding_unit_scores set (security_invoker = false);
alter view public.public_project_details set (security_invoker = false);
alter view public.public_source_claims set (security_invoker = false);
alter view public.public_wallet_evidence set (security_invoker = false);

comment on view public.current_project_scores is
  'Sanitized current project scores. Runs with research-only scores are excluded.';
comment on view public.current_founding_unit_scores is
  'Sanitized current founding-unit scores. Runs with research-only scores are excluded.';
comment on view public.public_project_details is
  'Public project detail projection over reviewed records and current scores.';
comment on view public.public_source_claims is
  'Public source-claim projection over active, reviewed research records.';
comment on view public.public_wallet_evidence is
  'Public wallet-evidence projection over active, reviewed records.';

revoke select on table
  public.calculation_runs,
  public.market_observations,
  public.tracked_wallets,
  public.wallet_asset_mappings,
  public.wallet_balance_observations
from anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke select on table ' ||
      'public.calculation_runs, public.market_observations, ' ||
      'public.tracked_wallets, public.wallet_asset_mappings, ' ||
      'public.wallet_balance_observations from authenticated';
  end if;
end;
$$;

create or replace function public.assert_anon_read_contract()
returns void
language plpgsql
as $$
declare
  offender record;
  offenders text := '';
begin
  for offender in
    select grantee, table_name
    from information_schema.role_table_grants
    where table_schema = 'public'
      and privilege_type = 'select'
      and grantee in ('anon', 'authenticated')
      and table_name not in (
        'assets', 'founding_unit_members', 'founding_unit_scores',
        'founding_units', 'funding_rounds', 'people',
        'project_founding_units', 'project_scores', 'projects',
        'record_sources', 'source_records', 'current_founding_unit_scores',
        'current_leaderboard', 'current_project_scores', 'current_scores',
        'public_data_freshness', 'public_leaderboard',
        'public_project_details', 'public_provider_status',
        'public_source_claims', 'public_wallet_evidence',
        'public_current_published_snapshot',
        'public_current_snapshot_results', 'public_current_snapshot_inputs',
        'public_snapshot_sources', 'public_current_snapshot_provider_health',
        'public_historical_snapshots', 'public_historical_snapshot_results',
        'public_latest_snapshot_status', 'public_provider_quota_status',
        'public_current_ranking_v2', 'public_current_ranking_v2_inputs',
        'public_current_ranking_v2_methodology',
        'public_current_ranking_v2_sources'
      )
    order by grantee, table_name
  loop
    offenders := offenders || format(
      '%s can select %s; ', offender.grantee, offender.table_name
    );
  end loop;

  if offenders <> '' then
    raise exception 'anon read-contract regression: %', offenders;
  end if;
end;
$$;

comment on function public.assert_anon_read_contract() is
  'Raises if anon/authenticated has select outside the intended public read allowlist.';

select public.assert_anon_read_contract();

revoke all on function public.assert_anon_read_contract() from public, anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function public.assert_anon_read_contract() from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.assert_anon_read_contract() to service_role';
  end if;
end;
$$;
