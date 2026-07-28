-- Hosted Supabase-only schedule. Keep separate from portable database tests.
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'phase-10-observation-retention') then
    perform cron.schedule(
      'phase-10-observation-retention',
      '17 3 * * *',
      $schedule$select public.run_observation_retention();$schedule$
    );
  end if;
end;
$$;
