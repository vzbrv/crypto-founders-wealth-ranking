create or replace view current_leaderboard with (security_invoker = true) as
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
order by scores.rank nulls last, units.display_name;

grant select on current_leaderboard to anon;
