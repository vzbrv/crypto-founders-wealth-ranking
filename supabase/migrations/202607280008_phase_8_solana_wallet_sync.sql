alter table wallet_balance_observations
  drop constraint wallet_balance_observations_block_hash_check;

alter table wallet_balance_observations
  add constraint wallet_balance_observations_block_hash_check
    check (
      block_hash is null
      or block_hash ~ '^0x[0-9a-fA-F]{64}$'
      or block_hash ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
    );

create or replace function ingest_wallet_sync(p_observations jsonb, p_health jsonb)
returns table (accepted_count integer, calculation_run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_wallet_id uuid;
  v_asset_id uuid;
  v_asset_decimals integer;
  v_chain_code text;
  v_provider text;
  v_contract_address text;
  v_mapping_type text;
  v_token_identifier text;
  v_observed_at timestamptz;
  v_fetched_at timestamptz;
  v_raw_balance numeric(78, 0);
  v_normalized_balance numeric(78, 18);
  v_decimals integer;
  v_block_number bigint;
  v_accepted integer := 0;
  v_run_id uuid;
  v_checked_at timestamptz := now();
begin
  begin
    if p_health ? 'checkedAt' then
      v_checked_at := (p_health->>'checkedAt')::timestamptz;
    end if;
  exception when others then
    v_checked_at := now();
  end;

  insert into provider_health (
    provider, checked_at, status, latency_ms, error_code, error_message, metadata
  ) values (
    coalesce(nullif(p_health->>'provider', ''), 'unknown-rpc'),
    v_checked_at,
    case when p_health->>'status' in ('healthy', 'degraded', 'failed')
      then p_health->>'status' else 'failed' end,
    case when coalesce(p_health->>'responseTimeMs', '') ~ '^[0-9]+$'
      then (p_health->>'responseTimeMs')::integer end,
    nullif(p_health->>'errorCode', ''),
    nullif(p_health->>'errorMessage', ''),
    coalesce(p_health->'metadata', '{}'::jsonb)
  );

  if jsonb_typeof(p_observations) <> 'array' then
    return query select 0, null::uuid;
    return;
  end if;

  for v_item in select value from jsonb_array_elements(p_observations)
  loop
    begin
      v_wallet_id := null;
      v_asset_id := null;
      select
        tw.id,
        a.id,
        a.decimals,
        tw.chain_code,
        case tw.chain_code
          when 'ethereum' then 'ethereum-rpc'
          when 'solana' then 'solana-rpc'
        end,
        a.contract_address,
        wam.balance_query_type,
        wam.token_identifier
      into
        v_wallet_id,
        v_asset_id,
        v_asset_decimals,
        v_chain_code,
        v_provider,
        v_contract_address,
        v_mapping_type,
        v_token_identifier
      from wallet_asset_mappings wam
      join tracked_wallets tw on tw.id = wam.tracked_wallet_id
      join assets a on a.id = wam.asset_id
      join projects p on p.id = a.project_id
      where tw.id::text = v_item->>'trackedWalletId'
        and a.id::text = v_item->>'assetId'
        and tw.chain_code = a.chain_code
        and tw.chain_code in ('ethereum', 'solana')
        and tw.status = 'active'
        and tw.affects_score
        and a.is_active
        and p.status = 'active';

      if v_wallet_id is null
        or v_item->>'provider' <> v_provider
        or coalesce(v_item->>'rawBalance', '') !~ '^[0-9]+$'
        or coalesce(v_item->>'normalizedBalance', '') !~ '^[0-9]+([.][0-9]+)?$'
        or coalesce(v_item->>'decimals', '') !~ '^[0-9]+$'
        or coalesce(v_item->>'blockNumber', '') !~ '^[0-9]+$'
        or v_mapping_type not in ('native', 'erc20')
        or (
          v_chain_code = 'ethereum'
          and coalesce(v_item->>'blockHash', '') !~ '^0x[0-9a-fA-F]{64}$'
        )
        or (
          v_chain_code = 'solana'
          and coalesce(v_item->>'blockHash', '') !~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$'
        )
      then
        continue;
      end if;

      v_observed_at := (v_item->>'observedAt')::timestamptz;
      v_fetched_at := (v_item->>'fetchedAt')::timestamptz;
      v_raw_balance := (v_item->>'rawBalance')::numeric;
      v_normalized_balance := (v_item->>'normalizedBalance')::numeric;
      v_decimals := (v_item->>'decimals')::integer;
      v_block_number := (v_item->>'blockNumber')::bigint;

      if v_decimals not between 0 and 18
        or (v_asset_decimals is not null and v_asset_decimals <> v_decimals)
        or (
          v_chain_code = 'ethereum'
          and (
            (v_mapping_type = 'native' and v_decimals <> 18)
            or (v_mapping_type = 'erc20' and (
              v_token_identifier is null
              or lower(v_token_identifier) <> lower(coalesce(v_contract_address, ''))
            ))
          )
        )
        or (
          v_chain_code = 'solana'
          and (v_mapping_type <> 'native' or v_decimals <> 9)
        )
        or v_normalized_balance <> v_raw_balance / power(10::numeric, v_decimals)
        or v_observed_at > now() + interval '5 minutes'
        or v_fetched_at > now() + interval '5 minutes'
        or exists (
          select 1 from wallet_balance_observations wbo
          where wbo.tracked_wallet_id = v_wallet_id
            and wbo.asset_id = v_asset_id
            and wbo.provider = v_provider
            and wbo.is_valid
            and (wbo.block_number >= v_block_number or wbo.observed_at >= v_observed_at)
        )
      then
        continue;
      end if;

      insert into wallet_balance_observations (
        tracked_wallet_id, asset_id, provider, block_number, block_hash,
        observed_at, fetched_at, raw_balance, decimals, normalized_balance,
        raw_payload, is_valid
      ) values (
        v_wallet_id, v_asset_id, v_provider, v_block_number,
        v_item->>'blockHash', v_observed_at, v_fetched_at, v_raw_balance,
        v_decimals, v_normalized_balance,
        coalesce(v_item->'rawPayload', '{}'::jsonb), true
      );
      v_accepted := v_accepted + 1;
    exception when others then
      continue;
    end;
  end loop;

  if v_accepted > 0 then
    v_run_id := recalculate_rankings('wallet_sync');
  end if;

  return query select v_accepted, v_run_id;
end;
$$;

revoke all on function ingest_wallet_sync(jsonb, jsonb) from public, anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function ingest_wallet_sync(jsonb, jsonb) to service_role';
  end if;
end;
$$;
