create type ranking_v2.publication_result as enum ('success', 'rejected');

create table ranking_v2.publication_attempts (
  id uuid primary key,
  snapshot_id uuid not null references ranking_v2.snapshots(id),
  attempted_at timestamptz not null default now(),
  engine_version text not null,
  result ranking_v2.publication_result not null
);

create table ranking_v2.publication_rejection_reasons (
  publication_attempt_id uuid not null references ranking_v2.publication_attempts(id),
  ordinal integer not null check (ordinal > 0),
  reason_code text not null,
  economic_project_id uuid references ranking_v2.economic_projects(id),
  subject_id uuid,
  public_message text not null,
  private_diagnostics jsonb not null default '{}'::jsonb,
  primary key (publication_attempt_id, ordinal)
);

create table ranking_v2.snapshot_invalidations (
  id uuid primary key,
  snapshot_id uuid not null references ranking_v2.snapshots(id),
  invalidated_at timestamptz not null default now(),
  reason_code text not null,
  public_message text not null,
  private_diagnostics jsonb not null default '{}'::jsonb
);

create table ranking_v2.current_published_snapshot (
  singleton boolean primary key default true check (singleton),
  snapshot_id uuid not null unique references ranking_v2.snapshots(id),
  changed_at timestamptz not null default now()
);

create trigger publication_attempts_append_only
before update or delete on ranking_v2.publication_attempts
for each row execute function ranking_v2.reject_mutation();

create trigger publication_rejection_reasons_append_only
before update or delete on ranking_v2.publication_rejection_reasons
for each row execute function ranking_v2.reject_mutation();

create trigger snapshot_invalidations_append_only
before update or delete on ranking_v2.snapshot_invalidations
for each row execute function ranking_v2.reject_mutation();

create or replace function ranking_v2.publish_snapshot(
  p_attempt_id uuid,
  p_snapshot_id uuid,
  p_engine_version text
) returns table (published boolean, reason_code text)
language plpgsql
security definer
set search_path = pg_catalog, ranking_v2
as $$
declare
  snapshot_row ranking_v2.snapshots%rowtype;
  project_count integer;
  score_count integer;
  rejection_code text;
  rejection_message text;
begin
  perform pg_advisory_xact_lock(hashtext('ranking_v2.publish_snapshot'));

  select * into snapshot_row
  from ranking_v2.snapshots
  where id = p_snapshot_id
  for update;

  if not found then
    raise exception 'unknown ranking v2 snapshot %', p_snapshot_id;
  end if;

  if exists (select 1 from ranking_v2.publication_attempts where id = p_attempt_id) then
    raise exception 'publication attempt % already exists', p_attempt_id;
  end if;

  if snapshot_row.status <> 'validated' then
    rejection_code := 'COHORT_INCOMPLETE';
    rejection_message := 'Snapshot has not passed cohort validation.';
  elsif snapshot_row.balance_inputs_hash = ''
    or snapshot_row.price_inputs_hash = ''
    or snapshot_row.supply_inputs_hash = ''
    or snapshot_row.capital_inputs_hash = ''
    or snapshot_row.evidence_state_hash = '' then
    rejection_code := 'INPUT_HASH_MISMATCH';
    rejection_message := 'Snapshot input hashes are incomplete.';
  else
    select count(*) into project_count from ranking_v2.economic_projects;
    select count(*) into score_count
    from ranking_v2.snapshot_project_scores
    where snapshot_id = p_snapshot_id;

    if score_count <> project_count then
      rejection_code := 'COHORT_INCOMPLETE';
      rejection_message := 'The validated snapshot does not contain the complete cohort.';
    elsif exists (
      select 1 from ranking_v2.snapshot_project_scores
      where snapshot_id = p_snapshot_id
        and eligibility_status <> 'ineligible'
        and confidence_status = 'insufficient'
    ) then
      rejection_code := 'CONFIDENCE_GATE_FAILED';
      rejection_message := 'An eligible project did not pass the minimum confidence gate.';
    end if;
  end if;

  if rejection_code is not null then
    insert into ranking_v2.publication_attempts
      (id, snapshot_id, engine_version, result)
    values (p_attempt_id, p_snapshot_id, p_engine_version, 'rejected');
    insert into ranking_v2.publication_rejection_reasons
      (publication_attempt_id, ordinal, reason_code, public_message)
    values (p_attempt_id, 1, rejection_code, rejection_message);
    return query select false, rejection_code;
    return;
  end if;

  insert into ranking_v2.publication_attempts
    (id, snapshot_id, engine_version, result)
  values (p_attempt_id, p_snapshot_id, p_engine_version, 'success');

  update ranking_v2.snapshots
  set status = 'published', published_at = now()
  where id = p_snapshot_id;

  insert into ranking_v2.current_published_snapshot
    (singleton, snapshot_id, changed_at)
  values (true, p_snapshot_id, now())
  on conflict (singleton) do update
  set snapshot_id = excluded.snapshot_id,
      changed_at = excluded.changed_at;

  return query select true, null::text;
end $$;

create or replace function ranking_v2.invalidate_snapshot(
  p_invalidation_id uuid,
  p_snapshot_id uuid,
  p_reason_code text,
  p_public_message text,
  p_private_diagnostics jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = pg_catalog, ranking_v2
as $$
  insert into ranking_v2.snapshot_invalidations
    (id, snapshot_id, reason_code, public_message, private_diagnostics)
  values
    (p_invalidation_id, p_snapshot_id, p_reason_code, p_public_message,
     coalesce(p_private_diagnostics, '{}'::jsonb));
$$;

revoke all on ranking_v2.publication_attempts,
  ranking_v2.publication_rejection_reasons,
  ranking_v2.snapshot_invalidations,
  ranking_v2.current_published_snapshot
from public, anon, authenticated;
revoke all on function ranking_v2.publish_snapshot(uuid, uuid, text) from public;
revoke all on function ranking_v2.invalidate_snapshot(uuid, uuid, text, text, jsonb) from public;

grant select on ranking_v2.publication_attempts,
  ranking_v2.publication_rejection_reasons,
  ranking_v2.snapshot_invalidations,
  ranking_v2.current_published_snapshot
to service_role;
grant execute on function ranking_v2.publish_snapshot(uuid, uuid, text) to service_role;
grant execute on function ranking_v2.invalidate_snapshot(uuid, uuid, text, text, jsonb) to service_role;
