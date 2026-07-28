do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end
$$;

create table founding_units (
  id uuid primary key,
  slug text not null unique,
  display_name text not null,
  description text not null,
  image_url text,
  iq_wiki_slug text,
  entity_type text not null check (entity_type in ('individual', 'team')),
  status text not null check (status in ('active', 'hidden', 'research')),
  research_reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table people (
  id uuid primary key,
  slug text not null unique,
  display_name text not null,
  description text,
  image_url text,
  iq_wiki_slug text,
  status text not null check (status in ('active', 'hidden', 'research')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table founding_unit_members (
  id bigserial primary key,
  founding_unit_id uuid not null references founding_units(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  role text,
  attribution_fraction numeric(20, 18) check (attribution_fraction between 0 and 1),
  unique (founding_unit_id, person_id)
);

create table projects (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  symbol text,
  description text not null,
  project_type text not null check (project_type in ('blockchain', 'protocol', 'token')),
  calculation_category text not null check (calculation_category in ('liquid_token', 'ineligible')),
  status text not null check (status in ('active', 'hidden', 'research')),
  confidence_level text not null check (confidence_level in ('high', 'medium', 'low', 'insufficient')),
  methodology_notes text not null,
  iq_wiki_slug text,
  website_url text not null,
  launched_at date,
  research_reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_founding_units (
  id bigserial primary key,
  project_id uuid not null references projects(id) on delete cascade,
  founding_unit_id uuid not null references founding_units(id) on delete cascade,
  attribution_fraction numeric(20, 18) not null check (attribution_fraction between 0 and 1),
  attribution_method text not null check (attribution_method in ('equal_split', 'documented_split', 'team_collective')),
  unique (project_id, founding_unit_id)
);

create table assets (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  asset_type text not null check (asset_type in ('native', 'token')),
  symbol text not null,
  name text not null,
  decimals integer check (decimals between 0 and 255),
  chain_code text,
  contract_address text,
  coingecko_id text,
  coinbase_product_id text,
  binance_symbol text,
  dex_screener_pair text,
  provider_ids jsonb not null default '{}'::jsonb,
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_active_primary_asset_per_project
  on assets(project_id) where is_primary and is_active;

create table market_observations (
  id bigserial primary key,
  asset_id uuid not null references assets(id) on delete restrict,
  provider text not null,
  observed_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  price_usd numeric(38, 18),
  circulating_supply numeric(78, 18),
  market_cap_usd numeric(38, 8),
  raw_payload jsonb not null default '{}'::jsonb,
  is_valid boolean not null default true,
  validation_errors jsonb not null default '[]'::jsonb,
  unique (asset_id, provider, observed_at)
);

create index market_observations_latest_idx
  on market_observations(asset_id, observed_at desc);

create table tracked_wallets (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  founding_unit_id uuid references founding_units(id) on delete set null,
  chain_code text not null,
  address text not null,
  normalized_address text not null,
  label text not null,
  owner_name text,
  classification text not null check (classification in ('founder', 'cofounder', 'founder_controlled_company', 'team', 'foundation', 'treasury', 'employee_pool', 'affiliate', 'unknown')),
  ownership_confidence text not null check (ownership_confidence in ('high', 'medium', 'low', 'disputed')),
  circulating_inclusion_fraction numeric(20, 18) check (circulating_inclusion_fraction between 0 and 1),
  affects_score boolean not null default true,
  status text not null check (status in ('active', 'hidden', 'research')),
  research_reviewed_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (chain_code, normalized_address)
);

create table wallet_asset_mappings (
  id bigserial primary key,
  tracked_wallet_id uuid not null references tracked_wallets(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  balance_query_type text not null,
  token_identifier text,
  unique (tracked_wallet_id, asset_id)
);

create table wallet_balance_observations (
  id bigserial primary key,
  tracked_wallet_id uuid not null references tracked_wallets(id) on delete restrict,
  asset_id uuid not null references assets(id) on delete restrict,
  provider text not null,
  block_number bigint,
  observed_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  raw_balance numeric(78, 0) not null,
  normalized_balance numeric(78, 18) not null,
  raw_payload jsonb not null default '{}'::jsonb,
  is_valid boolean not null default true,
  validation_errors jsonb not null default '[]'::jsonb,
  unique (tracked_wallet_id, asset_id, provider, observed_at)
);

create index wallet_balance_observations_latest_idx
  on wallet_balance_observations(tracked_wallet_id, asset_id, observed_at desc);

create table funding_rounds (
  id uuid primary key,
  project_id uuid not null references projects(id) on delete cascade,
  event_date date not null,
  round_type text not null check (round_type in ('pre_seed', 'seed', 'private', 'strategic', 'public', 'other')),
  original_amount numeric(38, 18),
  original_currency text,
  amount_usd_at_event numeric(38, 8),
  usd_conversion_method text,
  include_in_capital_deduction boolean not null default true,
  status text not null check (status in ('active', 'hidden', 'research')),
  reviewed_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table source_records (
  id uuid primary key,
  title text not null,
  url text not null,
  publisher text,
  source_type text not null,
  published_at timestamptz,
  accessed_at timestamptz not null,
  description text not null,
  status text not null check (status in ('active', 'broken', 'superseded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table record_sources (
  id uuid primary key,
  record_type text not null check (record_type in ('project', 'founding_unit', 'asset', 'tracked_wallet', 'funding_round')),
  record_id uuid not null,
  field text not null,
  source_record_id uuid not null references source_records(id) on delete cascade,
  support_type text not null check (support_type in ('primary', 'corroborating', 'contradicting')),
  notes text
);

create index record_sources_record_idx on record_sources(record_type, record_id);

create table calculation_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  trigger_type text not null,
  methodology_version text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  error_summary text,
  metadata jsonb not null default '{}'::jsonb
);

create table project_scores (
  id bigserial primary key,
  calculation_run_id uuid not null references calculation_runs(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete restrict,
  calculated_at timestamptz not null default now(),
  price_usd numeric(38, 18),
  circulating_supply numeric(78, 18),
  market_cap_usd numeric(38, 8),
  excluded_supply numeric(78, 18),
  excluded_value_usd numeric(38, 8),
  capital_raised_usd numeric(38, 8),
  outside_holder_supply numeric(78, 18),
  outside_holder_value_usd numeric(38, 8),
  score_usd numeric(38, 8),
  confidence_label text not null check (confidence_label in ('high', 'medium', 'low', 'insufficient')),
  market_observation_id bigint references market_observations(id) on delete set null,
  data_freshness jsonb not null,
  calculation_breakdown jsonb not null,
  warnings jsonb not null default '[]'::jsonb,
  unique (calculation_run_id, project_id, asset_id)
);

create index project_scores_latest_idx on project_scores(project_id, calculated_at desc);

create table founding_unit_scores (
  id bigserial primary key,
  calculation_run_id uuid not null references calculation_runs(id) on delete cascade,
  founding_unit_id uuid not null references founding_units(id) on delete cascade,
  calculated_at timestamptz not null default now(),
  score_usd numeric(38, 8),
  rank integer check (rank is null or rank > 0),
  previous_rank integer check (previous_rank is null or previous_rank > 0),
  rank_change integer,
  project_breakdown jsonb not null,
  confidence_label text not null check (confidence_label in ('high', 'medium', 'low', 'insufficient')),
  warnings jsonb not null default '[]'::jsonb,
  unique (calculation_run_id, founding_unit_id)
);

create index founding_unit_scores_latest_idx on founding_unit_scores(founding_unit_id, calculated_at desc);

create table provider_health (
  id bigserial primary key,
  provider text not null,
  checked_at timestamptz not null default now(),
  status text not null check (status in ('healthy', 'degraded', 'failed')),
  latency_ms integer,
  http_status integer,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

create index provider_health_latest_idx on provider_health(provider, checked_at desc);

alter table founding_units enable row level security;
alter table people enable row level security;
alter table founding_unit_members enable row level security;
alter table projects enable row level security;
alter table project_founding_units enable row level security;
alter table assets enable row level security;
alter table market_observations enable row level security;
alter table tracked_wallets enable row level security;
alter table wallet_asset_mappings enable row level security;
alter table wallet_balance_observations enable row level security;
alter table funding_rounds enable row level security;
alter table source_records enable row level security;
alter table record_sources enable row level security;
alter table calculation_runs enable row level security;
alter table project_scores enable row level security;
alter table founding_unit_scores enable row level security;
alter table provider_health enable row level security;

create policy public_read_active_founding_units on founding_units for select to anon using (status = 'active');
create policy public_read_active_people on people for select to anon using (status = 'active');
create policy public_read_active_projects on projects for select to anon using (status = 'active');
create policy public_read_active_sources on source_records for select to anon using (status = 'active');
create policy public_read_provider_health on provider_health for select to anon using (true);
create policy public_read_completed_runs on calculation_runs for select to anon using (status = 'completed');

create policy public_read_founding_unit_members on founding_unit_members for select to anon using (
  exists (select 1 from founding_units fu where fu.id = founding_unit_members.founding_unit_id and fu.status = 'active')
  and exists (select 1 from people p where p.id = founding_unit_members.person_id and p.status = 'active')
);
create policy public_read_project_founding_units on project_founding_units for select to anon using (
  exists (select 1 from projects p where p.id = project_founding_units.project_id and p.status = 'active')
  and exists (select 1 from founding_units fu where fu.id = project_founding_units.founding_unit_id and fu.status = 'active')
);
create policy public_read_assets on assets for select to anon using (
  assets.is_active and exists (select 1 from projects p where p.id = assets.project_id and p.status = 'active')
);
create policy public_read_market_observations on market_observations for select to anon using (
  market_observations.is_valid and exists (
    select 1 from assets a join projects p on p.id = a.project_id
    where a.id = market_observations.asset_id and a.is_active and p.status = 'active'
  )
);
create policy public_read_tracked_wallets on tracked_wallets for select to anon using (
  tracked_wallets.status = 'active' and exists (select 1 from projects p where p.id = tracked_wallets.project_id and p.status = 'active')
);
create policy public_read_wallet_asset_mappings on wallet_asset_mappings for select to anon using (
  exists (select 1 from tracked_wallets w where w.id = wallet_asset_mappings.tracked_wallet_id and w.status = 'active')
  and exists (select 1 from assets a where a.id = wallet_asset_mappings.asset_id and a.is_active)
);
create policy public_read_wallet_observations on wallet_balance_observations for select to anon using (
  wallet_balance_observations.is_valid
  and exists (select 1 from tracked_wallets w where w.id = wallet_balance_observations.tracked_wallet_id and w.status = 'active')
);
create policy public_read_funding_rounds on funding_rounds for select to anon using (
  funding_rounds.status = 'active' and exists (select 1 from projects p where p.id = funding_rounds.project_id and p.status = 'active')
);
create policy public_read_project_scores on project_scores for select to anon using (
  exists (
    select 1 from projects p
    where p.id = project_scores.project_id and p.status = 'active' and p.calculation_category = 'liquid_token'
  )
  and exists (select 1 from calculation_runs r where r.id = project_scores.calculation_run_id and r.status = 'completed')
);
create policy public_read_founding_unit_scores on founding_unit_scores for select to anon using (
  exists (select 1 from founding_units fu where fu.id = founding_unit_scores.founding_unit_id and fu.status = 'active')
  and exists (select 1 from calculation_runs r where r.id = founding_unit_scores.calculation_run_id and r.status = 'completed')
);
create policy public_read_record_sources on record_sources for select to anon using (
  exists (select 1 from source_records s where s.id = record_sources.source_record_id and s.status = 'active')
  and case record_sources.record_type
    when 'project' then exists (select 1 from projects p where p.id = record_sources.record_id and p.status = 'active')
    when 'founding_unit' then exists (select 1 from founding_units fu where fu.id = record_sources.record_id and fu.status = 'active')
    when 'asset' then exists (
      select 1 from assets a join projects p on p.id = a.project_id
      where a.id = record_sources.record_id and a.is_active and p.status = 'active'
    )
    when 'tracked_wallet' then exists (
      select 1 from tracked_wallets w join projects p on p.id = w.project_id
      where w.id = record_sources.record_id and w.status = 'active' and p.status = 'active'
    )
    when 'funding_round' then exists (
      select 1 from funding_rounds f join projects p on p.id = f.project_id
      where f.id = record_sources.record_id and f.status = 'active' and p.status = 'active'
    )
    else false
  end
);

grant usage on schema public to anon;
grant select on all tables in schema public to anon;

create view current_project_scores with (security_invoker = true) as
select distinct on (project_scores.project_id)
  project_scores.*
from project_scores
join projects on projects.id = project_scores.project_id
join calculation_runs on calculation_runs.id = project_scores.calculation_run_id
where projects.status = 'active'
  and projects.calculation_category = 'liquid_token'
  and calculation_runs.status = 'completed'
order by project_scores.project_id, project_scores.calculated_at desc, project_scores.id desc;

create view current_founding_unit_scores with (security_invoker = true) as
select distinct on (founding_unit_scores.founding_unit_id)
  founding_unit_scores.*
from founding_unit_scores
join founding_units on founding_units.id = founding_unit_scores.founding_unit_id
join calculation_runs on calculation_runs.id = founding_unit_scores.calculation_run_id
where founding_units.status = 'active'
  and calculation_runs.status = 'completed'
order by founding_unit_scores.founding_unit_id, founding_unit_scores.calculated_at desc, founding_unit_scores.id desc;

create view current_leaderboard with (security_invoker = true) as
select
  scores.rank,
  scores.previous_rank,
  scores.rank_change,
  scores.score_usd,
  scores.confidence_label,
  scores.calculated_at,
  units.id as founding_unit_id,
  units.slug,
  units.display_name,
  units.description,
  units.image_url,
  units.iq_wiki_slug,
  scores.project_breakdown,
  scores.warnings
from current_founding_unit_scores scores
join founding_units units on units.id = scores.founding_unit_id
where scores.rank is not null
order by scores.rank;

create view public_project_details with (security_invoker = true) as
select
  projects.id,
  projects.slug,
  projects.name,
  projects.symbol,
  projects.description,
  projects.project_type,
  projects.confidence_level,
  projects.methodology_notes,
  projects.iq_wiki_slug,
  projects.website_url,
  projects.launched_at,
  projects.research_reviewed_at,
  scores.score_usd,
  scores.market_cap_usd,
  scores.outside_holder_value_usd,
  scores.capital_raised_usd,
  scores.data_freshness,
  scores.calculation_breakdown,
  scores.warnings,
  scores.calculated_at
from projects
left join current_project_scores scores on scores.project_id = projects.id
where projects.status = 'active';

create view public_data_freshness with (security_invoker = true) as
select
  projects.id as project_id,
  projects.slug,
  projects.research_reviewed_at,
  max(market_observations.observed_at) as market_observed_at,
  max(wallet_balance_observations.observed_at) as wallet_observed_at,
  max(current_project_scores.calculated_at) as score_calculated_at
from projects
left join assets on assets.project_id = projects.id and assets.is_active
left join market_observations on market_observations.asset_id = assets.id and market_observations.is_valid
left join tracked_wallets on tracked_wallets.project_id = projects.id and tracked_wallets.status = 'active'
left join wallet_balance_observations on wallet_balance_observations.tracked_wallet_id = tracked_wallets.id and wallet_balance_observations.is_valid
left join current_project_scores on current_project_scores.project_id = projects.id
where projects.status = 'active'
group by projects.id, projects.slug, projects.research_reviewed_at;

grant select on current_project_scores, current_founding_unit_scores, current_leaderboard, public_project_details, public_data_freshness to anon;
