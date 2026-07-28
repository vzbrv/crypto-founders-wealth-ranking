create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'market-sync-every-five-minutes') then
    perform cron.schedule(
      'market-sync-every-five-minutes',
      '*/5 * * * *',
      $schedule$
        select net.http_post(
          url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
            || '/functions/v1/market-sync',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (
              select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
            )
          ),
          body := '{}'::jsonb
        );
      $schedule$
    );
  end if;
end;
$$;
