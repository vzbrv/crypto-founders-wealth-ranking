-- Keep the Arkham research projections server-side while allowing the
-- detail page to read their sanitized, non-secret projections.

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
        'public_arkham_evidence', 'public_arkham_coverage',
        'public_arkham_provider_status',
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

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname = 'sync-arkham-evidence-daily'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;

  perform cron.schedule(
    'sync-arkham-evidence-daily',
    '20 3 * * *',
    $schedule$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/sync-arkham-evidence',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := '{}'::jsonb
      );
    $schedule$
  );
end;
$$;
