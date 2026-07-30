-- Narrow read grants for Edge Functions that authenticate as service_role.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    -- provider-health reads only the sanitized status view.
    execute 'grant select on public.public_provider_status to service_role';

    -- Sync functions read these relations before invoking privileged RPCs.
    execute 'grant select on public.assets to service_role';
    execute 'grant select on public.wallet_asset_mappings to service_role';
    execute 'grant select on public.tracked_wallets to service_role';
  end if;
end;
$$;
