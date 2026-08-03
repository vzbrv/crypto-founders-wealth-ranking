-- Allow the server-side hourly snapshot function to read the private
-- unified ranking document. Public and authenticated clients remain blocked.

grant usage on schema public to service_role;
grant select on table public.unified_ranking_documents to service_role;
