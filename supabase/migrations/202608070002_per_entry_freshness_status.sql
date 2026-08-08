-- public_current_snapshot_results previously computed freshness_status
-- uniformly for every row in a snapshot, from the *snapshot's* own
-- observation_at — so every entry in a given hour always showed the same
-- freshness, even after 202608070001 added per-entry carry-forward
-- (which already computes a correct, entry-specific freshness_status into
-- hourly_snapshot_inputs, based on that entry's own data age).
--
-- This makes the view source freshness_status from the per-entry input
-- row instead, so a carried-forward entry (e.g. one provider persistently
-- omitting a single symbol) shows as stale on its own, without dragging
-- every other current entry's badge down with it, and without hiding its
-- own staleness behind the rest of the snapshot looking current.
--
-- This reproduces the view's actual current definition from
-- 202608030026_immutable_live_snapshot_contract.sql in full (same column
-- list and join to hourly_snapshot_inputs, which already existed there
-- for founder_team/project/market/upper_estimate) — only the
-- freshness_status expression changes.

create or replace view public.public_current_snapshot_results as
select results.snapshot_id, results.entry_id, results.rank, results.rank_change,
  results.value_type, results.gross_value_usd, results.final_value_usd,
  results.confidence_score, results.confidence_label, results.calculation,
  results.source_ids, snapshot.utc_hour, snapshot.observation_at,
  snapshot.publication_at,
  coalesce(
    inputs.freshness_status,
    case when snapshot.observation_at < now() - interval '90 minutes'
         then 'stale' else 'current' end
  ) as freshness_status,
  results.previous_rank, results.rank_change_status,
  coalesce(nullif(results.calculation->>'founderTeam', ''),
           nullif(inputs.metadata->>'founderTeam', '')) as founder_team,
  coalesce(nullif(results.calculation->>'project', ''),
           nullif(inputs.metadata->>'project', '')) as project,
  coalesce(results.calculation->'market', inputs.metadata->'market') as market,
  case lower(coalesce(results.calculation->>'upperEstimate',
                      inputs.metadata->>'upperEstimate', 'false'))
    when 'true' then true else false
  end as upper_estimate
from public.hourly_snapshot_results results
join public.current_published_snapshot snapshot on snapshot.id = results.snapshot_id
left join public.hourly_snapshot_inputs inputs
  on inputs.snapshot_id = results.snapshot_id and inputs.entry_id = results.entry_id
order by results.rank;

comment on view public.public_current_snapshot_results is
  'Current published hourly snapshot results. freshness_status is per-entry (sourced from hourly_snapshot_inputs), falling back to the whole-snapshot calculation only if an input row is unexpectedly missing.';
