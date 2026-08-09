create schema if not exists ranking_v2;

create type ranking_v2.snapshot_status as enum ('draft', 'validated', 'published');
create type ranking_v2.eligibility_status as enum ('eligible', 'provisional', 'ineligible');
create type ranking_v2.rank_order_status as enum ('exact', 'tied', 'overlapping', 'indeterminate', 'not_eligible');
create type ranking_v2.confidence_status as enum ('insufficient', 'low', 'medium', 'high');

create table ranking_v2.economic_projects (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table ranking_v2.snapshots (
  id uuid primary key,
  economic_as_of timestamptz not null,
  knowledge_cutoff timestamptz not null,
  snapshot_currency text not null check (snapshot_currency = 'USD'),
  monetary_basis text not null,
  methodology_version_id text not null,
  confidence_policy_version text not null,
  calculation_engine_version text not null,
  calculation_engine_git_commit text not null,
  calculation_solver_version text not null,
  solver_configuration_hash text not null,
  schema_version text not null,
  constraint_set_hash text not null,
  canonical_serialization_version text not null,
  balance_inputs_hash text not null,
  price_inputs_hash text not null,
  supply_inputs_hash text not null,
  capital_inputs_hash text not null,
  evidence_state_hash text not null,
  status ranking_v2.snapshot_status not null default 'draft',
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  published_at timestamptz,
  check ((status = 'draft') or validated_at is not null),
  check ((status <> 'published') or published_at is not null)
);

create table ranking_v2.people (
  id uuid primary key,
  display_name text not null
);

create table ranking_v2.entities (
  id uuid primary key,
  display_name text not null
);

create table ranking_v2.project_memberships (
  id uuid primary key,
  economic_project_id uuid not null references ranking_v2.economic_projects(id),
  person_id uuid references ranking_v2.people(id),
  entity_id uuid references ranking_v2.entities(id),
  role text not null,
  effective_from timestamptz,
  effective_to timestamptz,
  check ((person_id is not null and entity_id is null) or (person_id is null and entity_id is not null)),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

create table ranking_v2.review_decisions (
  id uuid primary key,
  subject_type text not null,
  subject_id uuid not null,
  decision text not null,
  reviewer_id text not null,
  reviewed_at timestamptz not null,
  supersedes_review_decision_id uuid references ranking_v2.review_decisions(id),
  correction_reason text,
  check ((supersedes_review_decision_id is null and correction_reason is null)
    or (supersedes_review_decision_id is not null and correction_reason is not null))
);

create table ranking_v2.snapshot_project_scores (
  snapshot_id uuid not null references ranking_v2.snapshots(id),
  economic_project_id uuid not null references ranking_v2.economic_projects(id),
  circulating_value_min numeric(38, 8) not null,
  circulating_value_max numeric(38, 8) not null,
  affiliated_value_min numeric(38, 8) not null,
  affiliated_value_max numeric(38, 8) not null,
  qualifying_capital_min numeric(38, 8) not null,
  qualifying_capital_max numeric(38, 8) not null,
  value_created_lower numeric(38, 8) not null,
  value_created_upper numeric(38, 8) not null,
  eligibility_status ranking_v2.eligibility_status not null,
  rank_min integer,
  rank_max integer,
  rank_order_status ranking_v2.rank_order_status not null,
  confidence_status ranking_v2.confidence_status not null,
  output_hash text not null,
  primary key (snapshot_id, economic_project_id),
  check (circulating_value_min <= circulating_value_max),
  check (affiliated_value_min <= affiliated_value_max),
  check (qualifying_capital_min <= qualifying_capital_max),
  check (value_created_lower <= value_created_upper),
  check ((eligibility_status = 'ineligible' and rank_min is null and rank_max is null and rank_order_status = 'not_eligible')
    or (eligibility_status <> 'ineligible' and rank_min is not null and rank_max is not null and rank_min > 0 and rank_min <= rank_max))
);

create or replace function ranking_v2.reject_mutation() returns trigger
language plpgsql as $$ begin raise exception '% is append-only', tg_table_name; end $$;

create trigger review_decisions_append_only before update or delete on ranking_v2.review_decisions
for each row execute function ranking_v2.reject_mutation();

create or replace function ranking_v2.reject_frozen_snapshot_mutation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.status in ('validated', 'published') then
    raise exception 'validated and published snapshots are immutable';
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' then
    raise exception 'validated and published snapshots are immutable';
  end if;
  if tg_op = 'UPDATE' and old.status = 'validated' then
    if new.status = 'published'
      and (to_jsonb(new) - array['status', 'published_at'])
        = (to_jsonb(old) - array['status', 'published_at']) then
      return new;
    end if;
    raise exception 'validated and published snapshots are immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger frozen_snapshots_immutable before update or delete on ranking_v2.snapshots
for each row execute function ranking_v2.reject_frozen_snapshot_mutation();

revoke all on schema ranking_v2 from public, anon, authenticated;
revoke all on all tables in schema ranking_v2 from public, anon, authenticated;
grant usage on schema ranking_v2 to service_role;
grant select, insert, update, delete on all tables in schema ranking_v2 to service_role;
