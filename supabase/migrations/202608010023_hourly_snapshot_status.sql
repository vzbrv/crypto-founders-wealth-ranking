create view public.public_latest_snapshot_status
as
select
  id,
  utc_hour,
  observation_at,
  publication_at,
  status,
  calculation_version,
  provider_health,
  failure_reason,
  created_at,
  updated_at
from public.hourly_snapshots
order by coalesce(publication_at, created_at) desc
limit 1;

grant select on public.public_latest_snapshot_status to anon, authenticated, service_role;
