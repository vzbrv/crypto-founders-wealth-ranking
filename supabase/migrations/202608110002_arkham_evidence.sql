create table public.arkham_provider_control (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  monthly_credit_limit numeric(20, 6),
  credits_used numeric(20, 6) not null default 0,
  paused_reason text,
  last_success_at timestamptz,
  last_run_status text not null default 'idle' check (last_run_status in ('idle', 'running', 'success', 'partial', 'failed', 'quota_paused')),
  last_run_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.arkham_provider_control (id) values (true)
on conflict (id) do nothing;

create table public.arkham_usage_events (
  id bigserial primary key,
  observed_at timestamptz not null default now(),
  endpoint text not null,
  response_status integer,
  estimated_credits numeric(20, 6) not null default 0,
  request_count integer not null default 1 check (request_count > 0),
  raw_response_hash text
);

create table public.arkham_raw_responses (
  raw_response_hash text primary key,
  endpoint text not null,
  queried_alias text,
  observed_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  payload jsonb not null
);

create table public.arkham_entity_mappings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  founding_unit_id uuid references public.founding_units(id) on delete set null,
  searched_alias text not null,
  entity_id text,
  entity_name text,
  entity_found boolean,
  discovery_status text not null check (discovery_status in ('unrun', 'found', 'not_found', 'ambiguous')),
  chain_code text,
  owner_class text not null check (owner_class in ('founder', 'team', 'foundation', 'treasury', 'company', 'custodial', 'exchange_customer_assets', 'unknown')),
  attribution_class text not null check (attribution_class in ('confirmed_entity', 'confirmed_address', 'predicted', 'rumored', 'project_token')),
  review_status text not null check (review_status in ('not_reviewed', 'in_progress', 'candidate', 'reviewed_insufficient', 'approved_sufficient')),
  ownership_confidence text not null check (ownership_confidence in ('high', 'medium', 'low', 'disputed')),
  score_affecting boolean not null default false,
  exclusion_reason text,
  stable_deduplication_key text not null unique,
  source_endpoint text not null,
  source_evidence_ids text[] not null default '{}',
  raw_response_hash text references public.arkham_raw_responses(raw_response_hash),
  observed_at timestamptz,
  last_success_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not score_affecting or review_status = 'approved_sufficient'),
  check (not score_affecting or attribution_class in ('confirmed_entity', 'confirmed_address')),
  check (not score_affecting or owner_class in ('founder', 'team', 'foundation', 'treasury', 'company'))
);

create table public.arkham_evidence (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'arkham' check (provider = 'arkham'),
  mapping_id uuid not null references public.arkham_entity_mappings(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  founding_unit_id uuid references public.founding_units(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  entity_id text,
  entity_name text,
  searched_alias text not null,
  chain_code text,
  address text,
  owner_class text not null check (owner_class in ('founder', 'team', 'foundation', 'treasury', 'company', 'custodial', 'exchange_customer_assets', 'unknown')),
  attribution_class text not null check (attribution_class in ('confirmed_entity', 'confirmed_address', 'predicted', 'rumored', 'project_token')),
  expected_project_token_symbol text not null,
  token_symbol text,
  token_quantity numeric(78, 18),
  arkham_usd_value numeric(38, 8),
  arkham_quote_time timestamptz,
  ingested_at timestamptz not null default now(),
  source_endpoint text not null,
  source_evidence_ids text[] not null default '{}',
  review_status text not null check (review_status in ('not_reviewed', 'in_progress', 'candidate', 'reviewed_insufficient', 'approved_sufficient')),
  ownership_confidence text not null check (ownership_confidence in ('high', 'medium', 'low', 'disputed')),
  circulating_inclusion_fraction numeric(20, 18) check (circulating_inclusion_fraction between 0 and 1),
  score_affecting boolean not null default false,
  exclusion_reason text,
  stable_deduplication_key text not null,
  raw_response_hash text references public.arkham_raw_responses(raw_response_hash),
  accepted_tracked_wallet_id uuid references public.tracked_wallets(id) on delete set null,
  valid boolean not null default true,
  created_at timestamptz not null default now(),
  check (not score_affecting or review_status = 'approved_sufficient'),
  check (not score_affecting or owner_class in ('founder', 'team', 'foundation', 'treasury', 'company')),
  check (not score_affecting or attribution_class in ('confirmed_entity', 'confirmed_address')),
  check (not score_affecting or token_symbol = expected_project_token_symbol),
  check (not score_affecting or token_quantity is not null),
  check (not score_affecting or circulating_inclusion_fraction is not null),
  check (not score_affecting or accepted_tracked_wallet_id is not null),
  check (not score_affecting or cardinality(source_evidence_ids) > 0)
);

create unique index arkham_evidence_project_dedup_idx
  on public.arkham_evidence(project_id, stable_deduplication_key);
create index arkham_evidence_project_idx on public.arkham_evidence(project_id, ingested_at desc);
create index arkham_entity_mappings_project_idx on public.arkham_entity_mappings(project_id, updated_at desc);

alter table public.arkham_provider_control enable row level security;
alter table public.arkham_usage_events enable row level security;
alter table public.arkham_raw_responses enable row level security;
alter table public.arkham_entity_mappings enable row level security;
alter table public.arkham_evidence enable row level security;

create policy arkham_control_service_role on public.arkham_provider_control
  for all to service_role using (true) with check (true);
create policy arkham_usage_service_role on public.arkham_usage_events
  for all to service_role using (true) with check (true);
create policy arkham_raw_service_role on public.arkham_raw_responses
  for all to service_role using (true) with check (true);
create policy arkham_mapping_service_role on public.arkham_entity_mappings
  for all to service_role using (true) with check (true);
create policy arkham_evidence_service_role on public.arkham_evidence
  for all to service_role using (true) with check (true);

create or replace view public.public_arkham_evidence
with (security_barrier = true, security_invoker = false)
as
select
  e.id,
  e.project_id,
  p.slug as project_slug,
  e.founding_unit_id,
  e.entity_name,
  e.searched_alias,
  e.chain_code,
  e.address,
  e.owner_class,
  e.attribution_class,
  e.expected_project_token_symbol,
  e.token_symbol,
  e.token_quantity,
  e.arkham_quote_time,
  e.ingested_at,
  e.review_status,
  e.ownership_confidence,
  e.circulating_inclusion_fraction,
  e.score_affecting,
  case
    when e.score_affecting then 'accepted'
    when e.owner_class in ('custodial', 'exchange_customer_assets') then 'custodial_excluded'
    when e.attribution_class in ('predicted', 'rumored') then 'non_scoring_research'
    else 'review_required'
  end as evidence_status,
  e.exclusion_reason,
  e.source_endpoint
from public.arkham_evidence e
join public.projects p on p.id = e.project_id
where p.status = 'active' and e.valid;

create or replace view public.public_arkham_coverage
with (security_barrier = true, security_invoker = false)
as
select
  m.id,
  m.project_id,
  p.slug as project_slug,
  m.founding_unit_id,
  m.searched_alias,
  m.entity_found,
  m.discovery_status,
  m.entity_id,
  m.entity_name,
  m.chain_code,
  m.owner_class,
  m.attribution_class,
  m.review_status,
  m.ownership_confidence,
  m.score_affecting,
  m.exclusion_reason,
  m.observed_at,
  m.last_success_at,
  m.source_endpoint,
  m.notes
from public.arkham_entity_mappings m
join public.projects p on p.id = m.project_id
where p.status = 'active';

grant select on public.public_arkham_evidence, public.public_arkham_coverage to anon, authenticated;

create or replace view public.public_arkham_provider_status
with (security_barrier = true, security_invoker = false)
as
select
  enabled,
  monthly_credit_limit,
  credits_used,
  case
    when paused_reason is not null then 'paused'
    when last_run_status = 'failed' then 'failed'
    when last_run_status = 'partial' then 'partial'
    when last_run_status = 'running' then 'running'
    when last_success_at is null then 'unverified'
    else 'healthy'
  end as status,
  last_success_at,
  last_run_status,
  last_run_completed_at,
  paused_reason,
  updated_at
from public.arkham_provider_control
where id;

grant select on public.public_arkham_provider_status to anon, authenticated;

create or replace function public.approve_arkham_evidence(
  p_evidence_id uuid,
  p_reviewer text,
  p_review_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate public.arkham_evidence%rowtype;
  wallet_id uuid;
  normalized text;
begin
  if p_reviewer is null or btrim(p_reviewer) = '' then
    raise exception 'reviewer is required';
  end if;

  select * into candidate from public.arkham_evidence where id = p_evidence_id for update;
  if not found then raise exception 'Arkham evidence not found'; end if;
  if candidate.address is null or candidate.chain_code is null then raise exception 'A confirmed address is required'; end if;
  if candidate.attribution_class not in ('confirmed_entity', 'confirmed_address') then raise exception 'Predicted or rumored evidence cannot be approved'; end if;
  if candidate.owner_class not in ('founder', 'team', 'foundation', 'treasury', 'company') then raise exception 'Owner class is not eligible'; end if;
  if candidate.founding_unit_id is null then raise exception 'Reviewed founding-unit mapping is required'; end if;
  if candidate.ownership_confidence <> 'high' then raise exception 'High ownership confidence is required'; end if;
  if candidate.token_symbol is distinct from candidate.expected_project_token_symbol then raise exception 'Project token cannot be reconciled'; end if;
  if candidate.token_quantity is null or candidate.circulating_inclusion_fraction is null then raise exception 'Quantity and circulation treatment are required'; end if;
  if cardinality(candidate.source_evidence_ids) = 0 then raise exception 'Evidence IDs are required'; end if;
  if candidate.asset_id is null then raise exception 'Asset mapping is required'; end if;

  if exists (
    select 1 from public.assets a
    where a.id = candidate.asset_id and (a.decimals is null or a.decimals > 18)
  ) then
    raise exception 'Asset decimals are not supported by wallet observations';
  end if;

  normalized := lower(btrim(candidate.address));
  wallet_id := gen_random_uuid();
  insert into public.tracked_wallets (
    id, project_id, founding_unit_id, chain_code, address, normalized_address, label,
    owner_name, classification, ownership_confidence, circulating_inclusion_fraction,
    affects_score, status, research_reviewed_at, notes
  ) values (
    wallet_id, candidate.project_id, candidate.founding_unit_id, candidate.chain_code,
    candidate.address, normalized, coalesce(candidate.entity_name, candidate.searched_alias),
    candidate.entity_name,
    case candidate.owner_class
      when 'company' then 'founder_controlled_company'
      else candidate.owner_class
    end,
    'high', candidate.circulating_inclusion_fraction,
    true, 'active', now(), concat('Arkham approval by ', p_reviewer, ': ', coalesce(p_review_notes, ''))
  );

  insert into public.wallet_asset_mappings (tracked_wallet_id, asset_id, balance_query_type, token_identifier)
  values (wallet_id, candidate.asset_id, 'arkham', candidate.token_symbol);

  insert into public.wallet_balance_observations (
    tracked_wallet_id, asset_id, provider, observed_at, fetched_at,
    raw_balance, decimals, normalized_balance, raw_payload, is_valid, validation_errors
  )
  select
    wallet_id,
    candidate.asset_id,
    'arkham',
    coalesce(candidate.arkham_quote_time, candidate.ingested_at),
    now(),
    round(candidate.token_quantity * power(10::numeric, coalesce(a.decimals, 18)))::numeric,
    coalesce(a.decimals, 18),
    candidate.token_quantity,
    jsonb_build_object(
      'provider', 'arkham',
      'raw_response_hash', candidate.raw_response_hash,
      'evidence_id', candidate.id
    ),
    true,
    '[]'::jsonb
  from public.assets a
  where a.id = candidate.asset_id;

  update public.arkham_evidence
  set score_affecting = true,
      review_status = 'approved_sufficient',
      accepted_tracked_wallet_id = wallet_id,
      exclusion_reason = null
  where id = p_evidence_id;
  update public.arkham_entity_mappings
  set score_affecting = true,
      review_status = 'approved_sufficient',
      updated_at = now()
  where id = candidate.mapping_id;
  return wallet_id;
end;
$$;

revoke all on function public.approve_arkham_evidence(uuid, text, text) from public, anon, authenticated;
grant execute on function public.approve_arkham_evidence(uuid, text, text) to service_role;

comment on table public.arkham_raw_responses is 'Service-role-only Arkham responses retained for reproducibility; never expose API credentials or unrestricted payloads.';
comment on view public.public_arkham_evidence is 'Sanitized Arkham evidence. Predictions, custodial assets, and unreviewed rows are explicitly non-scoring.';
