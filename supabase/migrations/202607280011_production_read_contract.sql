-- Production read contract, failure telemetry, and explicit anonymous grants.

create or replace function record_provider_failure(
  p_provider text,
  p_error_code text default null,
  p_error_message text default null,
  p_checked_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(trim(p_provider), '') is null then
    raise exception 'provider is required';
  end if;

  insert into provider_health (
    provider,
    checked_at,
    status,
    error_code,
    error_message
  ) values (
    trim(p_provider),
    p_checked_at,
    'failed',
    left(p_error_code, 120),
    left(p_error_message, 500)
  );
end;
$$;

revoke all on function record_provider_failure(text, text, text, timestamptz)
  from public, anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on function record_provider_failure(text, text, text, timestamptz) from authenticated';
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function record_provider_failure(text, text, text, timestamptz) to service_role';
  end if;
end;
$$;

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
  scores.calculated_at is null
    or scores.calculated_at < now() - interval '20 minutes' as is_stale,
  case
    when scores.calculated_at is null then 'score_unavailable'
    when scores.calculated_at < now() - interval '20 minutes' then 'refresh_overdue'
    else null
  end as stale_reason
from projects
left join current_project_scores scores on scores.project_id = projects.id
where projects.status = 'active';

create or replace view public_leaderboard with (security_invoker = true) as
select
  leaderboard.*,
  leaderboard.calculated_at is null
    or leaderboard.calculated_at < now() - interval '20 minutes' as is_stale,
  case
    when leaderboard.calculated_at is null then 'score_unavailable'
    when leaderboard.calculated_at < now() - interval '20 minutes' then 'refresh_overdue'
    else null
  end as stale_reason
from current_leaderboard leaderboard
order by leaderboard.rank nulls last, leaderboard.display_name;

comment on view current_scores is
  'Latest project scores for frontend reads; prior successful scores remain visible and become stale when refreshes fail.';
comment on view public_leaderboard is
  'Frontend leaderboard with explicit stale-data fields; failed refreshes do not erase the last successful ranking.';

-- Replace the broad Phase 3 grant with an audited allowlist. RLS still filters
-- rows in every approved base table. No anonymous or authenticated write grant
-- is present.
revoke all on all tables in schema public from anon;

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
  public_wallet_evidence
to anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'grant usage on schema public to authenticated';
    execute 'grant select on assets, calculation_runs, founding_unit_members, founding_unit_scores, founding_units, funding_rounds, market_observations, people, project_founding_units, project_scores, projects, record_sources, source_records, tracked_wallets, wallet_asset_mappings, wallet_balance_observations, current_founding_unit_scores, current_leaderboard, current_project_scores, current_scores, public_data_freshness, public_leaderboard, public_project_details, public_provider_status, public_source_claims, public_wallet_evidence to authenticated';
  end if;
end;
$$;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
