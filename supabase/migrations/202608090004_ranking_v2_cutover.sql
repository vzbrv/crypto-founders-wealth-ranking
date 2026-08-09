create or replace function public.get_current_ranking_v2()
returns table (
  snapshot_id uuid,
  economic_as_of timestamptz,
  knowledge_cutoff timestamptz,
  published_at timestamptz,
  economic_project_id uuid,
  project_slug text,
  project_name text,
  founder_team text,
  value_created_lower numeric,
  value_created_upper numeric,
  eligibility_status text,
  rank_min integer,
  rank_max integer,
  rank_order_status text,
  confidence_status text,
  is_invalidated boolean,
  invalidation_message text,
  methodology_version_id text,
  confidence_policy_version text
)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select
    snapshot.id,
    snapshot.economic_as_of,
    snapshot.knowledge_cutoff,
    snapshot.published_at,
    project.id,
    project.slug,
    project.name,
    coalesce(team.founder_team, 'Research pending'),
    score.value_created_lower,
    score.value_created_upper,
    score.eligibility_status::text,
    score.rank_min,
    score.rank_max,
    score.rank_order_status::text,
    score.confidence_status::text,
    invalidation.id is not null,
    invalidation.public_message,
    snapshot.methodology_version_id,
    snapshot.confidence_policy_version
  from ranking_v2.current_published_snapshot current_snapshot
  join ranking_v2.snapshots snapshot
    on snapshot.id = current_snapshot.snapshot_id
   and snapshot.status = 'published'
  join ranking_v2.snapshot_project_scores score
    on score.snapshot_id = snapshot.id
  join ranking_v2.economic_projects project
    on project.id = score.economic_project_id
  left join lateral (
    select string_agg(
      coalesce(person.display_name, entity.display_name) || ' (' || membership.role || ')',
      ', ' order by coalesce(person.display_name, entity.display_name), membership.id
    ) as founder_team
    from ranking_v2.project_memberships membership
    left join ranking_v2.people person on person.id = membership.person_id
    left join ranking_v2.entities entity on entity.id = membership.entity_id
    where membership.economic_project_id = project.id
      and (membership.effective_from is null
        or membership.effective_from <= snapshot.economic_as_of::date)
      and (membership.effective_to is null
        or membership.effective_to >= snapshot.economic_as_of::date)
  ) team on true
  left join lateral (
    select item.id, item.public_message
    from ranking_v2.snapshot_invalidations item
    where item.snapshot_id = snapshot.id
    order by item.invalidated_at desc, item.id desc
    limit 1
  ) invalidation on true
  order by score.rank_min nulls last, score.rank_max nulls last,
    project.name, project.id;
$$;

revoke all on function public.get_current_ranking_v2() from public;
grant execute on function public.get_current_ranking_v2()
to anon, authenticated, service_role;
