-- Replace legacy service-role schedules with CRON_SECRET-protected functions.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where jobname in (
      'market-sync-every-five-minutes',
      'wallet-sync-every-five-minutes',
      'sync-market-data',
      'sync-wallet-balances',
      'calculate-rankings',
      'provider-health'
    )
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;

  perform cron.schedule(
    'sync-market-data',
    '*/5 * * * *',
    $schedule$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/sync-market-data',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := '{}'::jsonb
      );
    $schedule$
  );

  perform cron.schedule(
    'sync-wallet-balances',
    '1-59/5 * * * *',
    $schedule$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/sync-wallet-balances',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := '{}'::jsonb
      );
    $schedule$
  );

  perform cron.schedule(
    'calculate-rankings',
    '3-59/5 * * * *',
    $schedule$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/calculate-rankings',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
        ),
        body := '{}'::jsonb
      );
    $schedule$
  );

  perform cron.schedule(
    'provider-health',
    '4-59/5 * * * *',
    $schedule$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
          || '/functions/v1/provider-health',
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
