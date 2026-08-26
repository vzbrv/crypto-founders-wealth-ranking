-- Pause automated API calls while ranking certainty is under review.
-- Database-only maintenance jobs remain scheduled.

do $$
declare
  v_job record;
begin
  for v_job in
    select jobid
    from cron.job
    where command ilike '%net.http_%'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

update public.provider_quota_config
set updates_enabled = false,
    updated_at = now();

update public.hourly_update_control
set updates_enabled = false,
    status = 'Paused — manual intervention required',
    paused_provider = null,
    paused_condition = 'rank_certainty_review',
    paused_at = now(),
    updated_at = now()
where id = true;

update public.arkham_provider_control
set enabled = false,
    paused_reason = 'rank_certainty_review',
    updated_at = now()
where id = true;
