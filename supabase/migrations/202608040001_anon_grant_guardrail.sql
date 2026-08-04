-- Guardrail against anonymous read-grant regressions.
--
-- 202607270001_phase_3_database.sql briefly granted `select` on every table
-- in schema public to anon before 202607280011_production_read_contract.sql
-- narrowed it to an explicit allowlist. That two-step history is fragile: if
-- migrations were ever replayed out of order, paused mid-chain, or a future
-- migration reintroduced a blanket grant, anon could regain access to tables
-- that were never meant to be publicly queryable directly.
--
-- This migration is a self-contained bookend that does not trust migration
-- order or history: it resets anon/authenticated table privileges to exactly
-- the relations this project intends to expose, and installs a function that
-- fails loudly (rather than silently drifting) if that ever changes.

-- 1. Reset to a known-good state regardless of what came before.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

grant usage on schema public to anon;
grant select on
  assets,
  calculation_runs,
  founding_unit_members,
  founding_unit_scores,
  founding_units,
  funding_rounds,
  market_observations,
  people,
  project_founding_units,
  project_scores,
  projects,
  record_sources,
  source_records,
  tracked_wallets,
  wallet_asset_mappings,
  wallet_balance_observations,
  current_founding_unit_scores,
  current_leaderboard,
  current_project_scores,
  current_scores,
  public_data_freshness,
  public_leaderboard,
  public_project_details,
  public_provider_status,
  public_source_claims,
  public_wallet_evidence,
  public_current_published_snapshot,
  public_current_snapshot_results,
  public_current_snapshot_inputs,
  public_snapshot_sources,
  public_current_snapshot_provider_health,
  public_historical_snapshots,
  public_historical_snapshot_results,
  public_latest_snapshot_status,
  public_provider_quota_status
to anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
    execute 'alter default privileges in schema public revoke all on tables from authenticated';
    execute 'alter default privileges in schema public revoke all on sequences from authenticated';
    execute 'grant usage on schema public to authenticated';
    execute 'grant select on ' ||
      'assets, calculation_runs, founding_unit_members, founding_unit_scores, ' ||
      'founding_units, funding_rounds, market_observations, people, ' ||
      'project_founding_units, project_scores, projects, record_sources, ' ||
      'source_records, tracked_wallets, wallet_asset_mappings, ' ||
      'wallet_balance_observations, current_founding_unit_scores, ' ||
      'current_leaderboard, current_project_scores, current_scores, ' ||
      'public_data_freshness, public_leaderboard, public_project_details, ' ||
      'public_provider_status, public_source_claims, public_wallet_evidence, ' ||
      'public_current_published_snapshot, public_current_snapshot_results, ' ||
      'public_current_snapshot_inputs, public_snapshot_sources, ' ||
      'public_current_snapshot_provider_health, public_historical_snapshots, ' ||
      'public_historical_snapshot_results, public_latest_snapshot_status, ' ||
      'public_provider_quota_status ' ||
      'to authenticated';
  end if;
end;
$$;

-- 2. Install a standing check that fails loudly instead of drifting silently.
--
-- Any relation in schema public that grants `select` to anon/authenticated
-- outside this allowlist causes an exception naming the offending relation
-- and grantee. Call this after every future migration touches grants, and
-- from the production verification job (see
-- packages/database/src/production-verification.ts), so a regression is
-- caught in CI/staging rather than discovered in production.
create or replace function assert_anon_read_contract()
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
        'assets', 'calculation_runs', 'founding_unit_members',
        'founding_unit_scores', 'founding_units', 'funding_rounds',
        'market_observations', 'people', 'project_founding_units',
        'project_scores', 'projects', 'record_sources', 'source_records',
        'tracked_wallets', 'wallet_asset_mappings',
        'wallet_balance_observations', 'current_founding_unit_scores',
        'current_leaderboard', 'current_project_scores', 'current_scores',
        'public_data_freshness', 'public_leaderboard',
        'public_project_details', 'public_provider_status',
        'public_source_claims', 'public_wallet_evidence',
        'public_current_published_snapshot',
        'public_current_snapshot_results', 'public_current_snapshot_inputs',
        'public_snapshot_sources', 'public_current_snapshot_provider_health',
        'public_historical_snapshots', 'public_historical_snapshot_results',
        'public_latest_snapshot_status', 'public_provider_quota_status'
      )
    order by grantee, table_name
  loop
    offenders := offenders || format('%s can select %s; ', offender.grantee, offender.table_name);
  end loop;

  if offenders <> '' then
    raise exception 'anon read-contract regression: %', offenders;
  end if;
end;
$$;

comment on function assert_anon_read_contract() is
  'Raises if anon/authenticated has select on any relation outside the intended public read allowlist. Run after grant-affecting migrations and from production verification.';

-- Fail this migration immediately if the reset above didn't converge to the
-- intended state (e.g. a relation name above is stale/misspelled).
select assert_anon_read_contract();

revoke all on function assert_anon_read_contract() from public, anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function assert_anon_read_contract() from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function assert_anon_read_contract() to service_role';
  end if;
end;
$$;
