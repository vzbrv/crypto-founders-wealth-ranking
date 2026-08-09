create table ranking_v2.assets (
  id uuid primary key,
  symbol text not null,
  canonical_asset_id uuid references ranking_v2.assets(id),
  decimals integer not null check (decimals between 0 and 36)
);

create table ranking_v2.price_observations_raw (
  id uuid primary key,
  asset_id uuid not null references ranking_v2.assets(id),
  quote_currency text not null check (quote_currency = 'USD'),
  price numeric(38, 18) not null check (price >= 0),
  observed_at timestamptz not null,
  known_at timestamptz not null default now(),
  retrieved_at timestamptz not null,
  provider_id text not null,
  provider_adapter_version text not null,
  source_id text not null,
  check (known_at >= retrieved_at)
);

create table ranking_v2.circulating_supply_observations_raw (
  id uuid primary key,
  asset_id uuid not null references ranking_v2.assets(id),
  circulating_units numeric(48, 18) not null check (circulating_units >= 0),
  observed_at timestamptz not null,
  known_at timestamptz not null default now(),
  retrieved_at timestamptz not null,
  provider_id text not null,
  provider_adapter_version text not null,
  source_id text not null,
  provider_supply_methodology text not null,
  check (known_at >= retrieved_at)
);

create table ranking_v2.market_cap_observations_diagnostic (
  id uuid primary key,
  asset_id uuid not null references ranking_v2.assets(id),
  market_cap numeric(38, 8) not null check (market_cap >= 0),
  observed_at timestamptz not null,
  known_at timestamptz not null default now(),
  provider_id text not null,
  source_id text not null
);

create table ranking_v2.balance_observations_raw (
  id uuid primary key,
  asset_id uuid not null references ranking_v2.assets(id),
  address text not null,
  balance_units numeric(48, 18) not null check (balance_units >= 0),
  observed_at timestamptz not null,
  known_at timestamptz not null default now(),
  retrieved_at timestamptz not null,
  provider_id text not null,
  provider_adapter_version text not null,
  source_id text not null,
  check (known_at >= retrieved_at)
);

create table ranking_v2.ownership_exposures (
  id uuid primary key,
  economic_project_id uuid not null references ranking_v2.economic_projects(id),
  asset_id uuid not null references ranking_v2.assets(id),
  balance_units_min numeric(48, 18) not null check (balance_units_min >= 0),
  balance_units_max numeric(48, 18) not null check (balance_units_max >= balance_units_min),
  affiliated_fraction_min numeric(20, 18) not null,
  affiliated_fraction_max numeric(20, 18) not null,
  circulating_fraction_min numeric(20, 18) not null,
  circulating_fraction_max numeric(20, 18) not null,
  effective_from timestamptz,
  effective_to timestamptz,
  known_at timestamptz not null default now(),
  material boolean not null,
  resolved boolean not null,
  check (affiliated_fraction_min between 0 and 1),
  check (affiliated_fraction_max between affiliated_fraction_min and 1),
  check (circulating_fraction_min between 0 and 1),
  check (circulating_fraction_max between circulating_fraction_min and 1),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create table ranking_v2.capital_events (
  id uuid primary key,
  amount_min numeric(38, 8) not null check (amount_min >= 0),
  amount_max numeric(38, 8) not null check (amount_max >= amount_min),
  currency text not null check (currency = 'USD'),
  economic_time timestamptz not null,
  known_at timestamptz not null default now(),
  material boolean not null
);

create table ranking_v2.capital_event_project_allocations (
  capital_event_id uuid not null references ranking_v2.capital_events(id),
  economic_project_id uuid not null references ranking_v2.economic_projects(id),
  amount_min numeric(38, 8) not null check (amount_min >= 0),
  amount_max numeric(38, 8) not null check (amount_max >= amount_min),
  primary key (capital_event_id, economic_project_id)
);

create table ranking_v2.capital_event_unallocated_remainders (
  capital_event_id uuid primary key references ranking_v2.capital_events(id),
  amount_min numeric(38, 8) not null check (amount_min >= 0),
  amount_max numeric(38, 8) not null check (amount_max >= amount_min)
);

create table ranking_v2.snapshot_price_inputs (
  snapshot_id uuid not null references ranking_v2.snapshots(id),
  asset_id uuid not null references ranking_v2.assets(id),
  price_observation_id uuid not null references ranking_v2.price_observations_raw(id),
  primary key (snapshot_id, asset_id)
);

create table ranking_v2.snapshot_supply_inputs (
  snapshot_id uuid not null references ranking_v2.snapshots(id),
  asset_id uuid not null references ranking_v2.assets(id),
  supply_observation_id uuid not null references ranking_v2.circulating_supply_observations_raw(id),
  primary key (snapshot_id, asset_id)
);

create table ranking_v2.snapshot_balance_inputs (
  snapshot_id uuid not null references ranking_v2.snapshots(id),
  balance_observation_id uuid not null references ranking_v2.balance_observations_raw(id),
  primary key (snapshot_id, balance_observation_id)
);

create trigger prices_append_only before update or delete on ranking_v2.price_observations_raw
for each row execute function ranking_v2.reject_mutation();
create trigger supplies_append_only before update or delete on ranking_v2.circulating_supply_observations_raw
for each row execute function ranking_v2.reject_mutation();
create trigger balances_append_only before update or delete on ranking_v2.balance_observations_raw
for each row execute function ranking_v2.reject_mutation();
create trigger ownership_append_only before update or delete on ranking_v2.ownership_exposures
for each row execute function ranking_v2.reject_mutation();
create trigger capital_events_append_only before update or delete on ranking_v2.capital_events
for each row execute function ranking_v2.reject_mutation();
create trigger capital_allocations_append_only before update or delete on ranking_v2.capital_event_project_allocations
for each row execute function ranking_v2.reject_mutation();
create trigger capital_remainders_append_only before update or delete on ranking_v2.capital_event_unallocated_remainders
for each row execute function ranking_v2.reject_mutation();
create trigger diagnostic_market_caps_append_only before update or delete on ranking_v2.market_cap_observations_diagnostic
for each row execute function ranking_v2.reject_mutation();

create or replace function ranking_v2.validate_capital_event_review() returns trigger
language plpgsql as $$
declare
  event_min numeric;
  event_max numeric;
  allocated_min numeric;
  allocated_max numeric;
  remainder_min numeric;
  remainder_max numeric;
  allocations_are_exact boolean;
begin
  if new.subject_type <> 'capital_event' or new.decision <> 'approved' then
    return new;
  end if;

  select amount_min, amount_max into event_min, event_max
  from ranking_v2.capital_events where id = new.subject_id;
  if not found then raise exception 'capital event does not exist'; end if;

  select coalesce(sum(amount_min), 0), coalesce(sum(amount_max), 0),
    coalesce(bool_and(amount_min = amount_max), true)
  into allocated_min, allocated_max, allocations_are_exact
  from ranking_v2.capital_event_project_allocations
  where capital_event_id = new.subject_id;

  select amount_min, amount_max into remainder_min, remainder_max
  from ranking_v2.capital_event_unallocated_remainders
  where capital_event_id = new.subject_id;
  if not found then raise exception 'reviewed capital event requires an explicit remainder'; end if;

  if allocated_min + remainder_min > event_max
    or allocated_max + remainder_max < event_min then
    raise exception 'capital allocation has no feasible conserved state';
  end if;

  if event_min = event_max and allocations_are_exact and remainder_min = remainder_max
    and allocated_min + remainder_min <> event_min then
    raise exception 'exact capital allocation must conserve event amount';
  end if;
  return new;
end $$;

create trigger review_capital_conservation before insert on ranking_v2.review_decisions
for each row execute function ranking_v2.validate_capital_event_review();

revoke all on all tables in schema ranking_v2 from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema ranking_v2 to service_role;
