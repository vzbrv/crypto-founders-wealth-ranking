-- The Arkham Edge Functions use PostgREST with service_role authentication.
-- RLS policies do not replace the underlying table/view privileges required by
-- PostgREST, so keep these grants explicit and server-side only.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on public.public_arkham_provider_status to service_role';

    -- Provider-health, hourly snapshot, and daily ingestion access.
    execute 'grant select, insert, update on public.arkham_provider_control to service_role';
    execute 'grant insert on public.arkham_usage_events to service_role';
    execute 'grant select, insert, update on public.arkham_raw_responses to service_role';
    execute 'grant select, update on public.arkham_entity_mappings to service_role';
    execute 'grant select, insert, update on public.arkham_evidence to service_role';
  end if;
end;
$$;
