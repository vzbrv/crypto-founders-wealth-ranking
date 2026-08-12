-- Allow the Arkham ingestion function to resolve internal project ids to slugs.
-- Keep the grant limited to the two columns used by its PostgREST lookup.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select (id, slug) on public.projects to service_role';
  end if;
end;
$$;
