-- Forward-only correction: reviewed inputs and explicit ranking eligibility.

alter table projects
  add column wallet_review_status text not null default 'not_reviewed'
    check (wallet_review_status in ('not_reviewed', 'in_progress', 'approved_sufficient', 'reviewed_insufficient')),
  add column wallet_review_reviewer text,
  add column wallet_review_reviewed_at timestamptz,
  add column wallet_review_notes text,
  add column wallet_review_evidence_source_ids jsonb not null default '[]'::jsonb,
  add column funding_review_status text not null default 'not_reviewed'
    check (funding_review_status in ('not_reviewed', 'in_progress', 'approved_sufficient', 'reviewed_insufficient')),
  add column funding_review_reviewer text,
  add column funding_review_reviewed_at timestamptz,
  add column funding_review_notes text,
  add column funding_review_evidence_source_ids jsonb not null default '[]'::jsonb;

alter table projects
  add constraint projects_wallet_completed_review_metadata check (
    wallet_review_status not in ('approved_sufficient', 'reviewed_insufficient')
    or (
      wallet_review_reviewer is not null
      and wallet_review_reviewed_at is not null
      and wallet_review_notes is not null
      and jsonb_array_length(wallet_review_evidence_source_ids) > 0
    )
  ),
  add constraint projects_funding_completed_review_metadata check (
    funding_review_status not in ('approved_sufficient', 'reviewed_insufficient')
    or (
      funding_review_reviewer is not null
      and funding_review_reviewed_at is not null
      and funding_review_notes is not null
      and jsonb_array_length(funding_review_evidence_source_ids) > 0
    )
  );

alter table tracked_wallets
  add column balance_included_in_circulating_supply boolean,
  add column deduplication_key text,
  add column review_status text not null default 'not_reviewed'
    check (review_status in ('not_reviewed', 'in_progress', 'approved_sufficient', 'reviewed_insufficient')),
  add column reviewer text,
  add column reviewed_at timestamptz,
  add column evidence_source_ids jsonb not null default '[]'::jsonb;

alter table tracked_wallets
  add constraint tracked_wallet_completed_review_metadata check (
    review_status not in ('approved_sufficient', 'reviewed_insufficient')
    or (
      reviewer is not null
      and reviewed_at is not null
      and evidence_source_ids <> '[]'::jsonb
    )
  ),
  add constraint tracked_wallet_reviewed_zero_metadata check (
    circulating_inclusion_fraction is distinct from 0
    or (
      reviewer is not null
      and reviewed_at is not null
      and notes is not null
      and evidence_source_ids <> '[]'::jsonb
    )
  );

update tracked_wallets set deduplication_key = id::text where deduplication_key is null;
alter table tracked_wallets alter column deduplication_key set not null;
alter table tracked_wallets alter column deduplication_key set default gen_random_uuid()::text;
create unique index tracked_wallets_project_deduplication_key
  on tracked_wallets(project_id, deduplication_key);

alter table funding_rounds
  add column deduplication_key text,
  add column review_status text not null default 'not_reviewed'
    check (review_status in ('not_reviewed', 'in_progress', 'approved_sufficient', 'reviewed_insufficient')),
  add column reviewer text,
  add column evidence_source_ids jsonb not null default '[]'::jsonb;

alter table funding_rounds
  add constraint funding_round_completed_review_metadata check (
    review_status not in ('approved_sufficient', 'reviewed_insufficient')
    or (
      reviewer is not null
      and reviewed_at is not null
      and evidence_source_ids <> '[]'::jsonb
    )
  ),
  add constraint funding_round_reviewed_zero_metadata check (
    amount_usd_at_event is distinct from 0
    or (
      reviewer is not null
      and reviewed_at is not null
      and notes is not null
      and evidence_source_ids <> '[]'::jsonb
    )
  );

update funding_rounds set deduplication_key = id::text where deduplication_key is null;
alter table funding_rounds alter column deduplication_key set not null;
alter table funding_rounds alter column deduplication_key set default gen_random_uuid()::text;
create unique index funding_rounds_project_deduplication_key
  on funding_rounds(project_id, deduplication_key);

alter table project_scores
  add column eligibility_status text not null default 'research_in_progress'
    check (eligibility_status in ('ranked', 'research_in_progress')),
  add column ineligibility_reasons jsonb not null default '[]'::jsonb;

alter table founding_unit_scores
  add column eligibility_status text not null default 'research_in_progress'
    check (eligibility_status in ('ranked', 'research_in_progress')),
  add column ineligibility_reasons jsonb not null default '[]'::jsonb;

-- Views created with `table.*` keep their original expansion after columns are
-- added. Refresh them before the corrected ranking function reads review state.
create or replace view current_project_scores with (security_invoker = true) as
select distinct on (project_scores.project_id)
  project_scores.*
from project_scores
join projects on projects.id = project_scores.project_id
join calculation_runs on calculation_runs.id = project_scores.calculation_run_id
where projects.status = 'active'
  and projects.calculation_category = 'liquid_token'
  and calculation_runs.status = 'completed'
order by project_scores.project_id, project_scores.calculated_at desc, project_scores.id desc;

create or replace view current_founding_unit_scores with (security_invoker = true) as
select distinct on (founding_unit_scores.founding_unit_id)
  founding_unit_scores.*
from founding_unit_scores
join founding_units on founding_units.id = founding_unit_scores.founding_unit_id
join calculation_runs on calculation_runs.id = founding_unit_scores.calculation_run_id
where founding_units.status = 'active'
  and calculation_runs.status = 'completed'
order by founding_unit_scores.founding_unit_id, founding_unit_scores.calculated_at desc, founding_unit_scores.id desc;

update founding_unit_scores
set rank = null,
    previous_rank = null,
    rank_change = null,
    ineligibility_reasons = '["Legacy score predates methodology-integrity review"]'::jsonb;

create or replace function recalculate_rankings(p_trigger_type text default 'market_sync')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  insert into calculation_runs (trigger_type, methodology_version, status, metadata)
  values (
    p_trigger_type,
    'methodology-integrity-v1',
    'running',
    jsonb_build_object(
      'formula', 'max(0, circulating_market_value - affiliated_circulating_holdings_value - disclosed_outside_capital)',
      'unknownsRanked', false
    )
  )
  returning id into v_run_id;

  with latest_market as (
    select distinct on (asset_id) *
    from market_observations
    where is_valid
    order by asset_id, observed_at desc, id desc
  ), active_wallet_mappings as (
    select
      wam.asset_id,
      w.id as wallet_id,
      w.balance_included_in_circulating_supply,
      w.circulating_inclusion_fraction,
      w.review_status,
      w.reviewer,
      w.reviewed_at,
      w.evidence_source_ids
    from wallet_asset_mappings wam
    join tracked_wallets w on w.id = wam.tracked_wallet_id
    where w.status = 'active' and w.affects_score
  ), latest_wallet as (
    select distinct on (tracked_wallet_id, asset_id) *
    from wallet_balance_observations
    where is_valid
    order by tracked_wallet_id, asset_id, observed_at desc, id desc
  ), wallet_rollup as (
    select
      awm.asset_id,
      count(*) as required_count,
      count(lw.id) filter (where awm.balance_included_in_circulating_supply) as observed_count,
      bool_and(
        awm.review_status = 'approved_sufficient'
        and awm.reviewer is not null
        and awm.reviewed_at is not null
        and jsonb_array_length(awm.evidence_source_ids) > 0
        and awm.balance_included_in_circulating_supply is not null
        and (
          not awm.balance_included_in_circulating_supply
          or (awm.circulating_inclusion_fraction is not null and lw.id is not null)
        )
      ) as all_reviewed,
      sum(
        case
          when awm.balance_included_in_circulating_supply
            and awm.review_status = 'approved_sufficient'
            and awm.circulating_inclusion_fraction is not null
            and lw.id is not null
          then lw.normalized_balance * awm.circulating_inclusion_fraction
        end
      ) as excluded_supply,
      max(lw.observed_at) as observed_at
    from active_wallet_mappings awm
    left join latest_wallet lw
      on lw.tracked_wallet_id = awm.wallet_id and lw.asset_id = awm.asset_id
    group by awm.asset_id
  ), funding_rollup as (
    select
      project_id,
      count(*) as required_count,
      bool_and(
        review_status = 'approved_sufficient'
        and reviewer is not null
        and reviewed_at is not null
        and jsonb_array_length(evidence_source_ids) > 0
        and amount_usd_at_event is not null
      ) as all_reviewed,
      sum(
        case when review_status = 'approved_sufficient' and amount_usd_at_event is not null
          then amount_usd_at_event
        end
      ) as capital_raised
    from funding_rounds
    where status = 'active' and include_in_capital_deduction
    group by project_id
  ), inputs as (
    select
      p.id as project_id,
      p.confidence_level,
      p.wallet_review_status,
      p.wallet_review_reviewer,
      p.wallet_review_reviewed_at,
      p.wallet_review_evidence_source_ids,
      p.funding_review_status,
      p.funding_review_reviewer,
      p.funding_review_reviewed_at,
      p.funding_review_evidence_source_ids,
      a.id as asset_id,
      lm.id as market_observation_id,
      lm.observed_at as market_observed_at,
      lm.price_usd,
      lm.circulating_supply,
      coalesce(wr.required_count, 0) as required_wallet_count,
      coalesce(wr.observed_count, 0) as observed_wallet_count,
      coalesce(wr.all_reviewed, true) as all_wallet_rows_reviewed,
      wr.excluded_supply,
      wr.observed_at as wallet_observed_at,
      coalesce(fr.required_count, 0) as required_funding_count,
      coalesce(fr.all_reviewed, true) as all_funding_rows_reviewed,
      fr.capital_raised
    from projects p
    join assets a on a.project_id = p.id and a.is_primary and a.is_active
    left join latest_market lm on lm.asset_id = a.id
    left join wallet_rollup wr on wr.asset_id = a.id
    left join funding_rollup fr on fr.project_id = p.id
    where p.status = 'active' and p.calculation_category = 'liquid_token'
  ), evaluated as (
    select
      inputs.*,
      market_observation_id is not null
        and market_observed_at >= now() - interval '20 minutes'
        and price_usd > 0
        and circulating_supply >= 0 as market_ready,
      wallet_review_status = 'approved_sufficient'
        and wallet_review_reviewer is not null
        and wallet_review_reviewed_at is not null
        and jsonb_array_length(wallet_review_evidence_source_ids) > 0
        and all_wallet_rows_reviewed as wallet_ready,
      funding_review_status = 'approved_sufficient'
        and funding_review_reviewer is not null
        and funding_review_reviewed_at is not null
        and jsonb_array_length(funding_review_evidence_source_ids) > 0
        and all_funding_rows_reviewed as funding_ready
    from inputs
  ), final as (
    select
      evaluated.*,
      market_ready
        and wallet_ready
        and funding_ready
        and confidence_level <> 'insufficient'
        and coalesce(excluded_supply, 0) <= circulating_supply as eligible,
      array_remove(array[
        case when not market_ready then 'Recent sourced market data is unavailable' end,
        case when not wallet_ready then 'Wallet review is not approved and sufficient' end,
        case when not funding_ready then 'Funding review is not approved and sufficient' end,
        case when confidence_level = 'insufficient' then 'Reviewed confidence is insufficient' end,
        case when market_ready and coalesce(excluded_supply, 0) > circulating_supply then 'Affiliated circulating holdings exceed circulating supply' end
      ]::text[], null) as reasons
    from evaluated
  )
  insert into project_scores (
    calculation_run_id, project_id, asset_id, price_usd, circulating_supply,
    market_cap_usd, excluded_supply, excluded_value_usd, capital_raised_usd,
    outside_holder_supply, outside_holder_value_usd, score_usd, confidence_label,
    market_observation_id, data_freshness, calculation_breakdown, warnings,
    eligibility_status, ineligibility_reasons
  )
  select
    v_run_id,
    project_id,
    asset_id,
    price_usd,
    circulating_supply,
    case when market_ready then price_usd * circulating_supply end,
    case when wallet_ready then coalesce(excluded_supply, 0) end,
    case when market_ready and wallet_ready then price_usd * coalesce(excluded_supply, 0) end,
    case when funding_ready then coalesce(capital_raised, 0) end,
    case when market_ready and wallet_ready then greatest(0, circulating_supply - coalesce(excluded_supply, 0)) end,
    case when market_ready and wallet_ready then greatest(0, price_usd * (circulating_supply - coalesce(excluded_supply, 0))) end,
    case when eligible then greatest(0, price_usd * circulating_supply - price_usd * coalesce(excluded_supply, 0) - coalesce(capital_raised, 0)) end,
    case when eligible then confidence_level else 'insufficient' end,
    market_observation_id,
    jsonb_build_object('marketObservedAt', market_observed_at, 'walletObservedAt', wallet_observed_at),
    jsonb_build_object(
      'formula', 'max(0, circulating_market_value - affiliated_circulating_holdings_value - disclosed_outside_capital)',
      'priceUsd', price_usd,
      'circulatingSupply', circulating_supply,
      'affiliatedCirculatingSupply', case when wallet_ready then coalesce(excluded_supply, 0) end,
      'disclosedOutsideCapitalUsd', case when funding_ready then coalesce(capital_raised, 0) end,
      'requiredWalletCount', required_wallet_count,
      'observedWalletCount', observed_wallet_count,
      'requiredFundingCount', required_funding_count
    ),
    to_jsonb(reasons),
    case when eligible then 'ranked' else 'research_in_progress' end,
    to_jsonb(reasons)
  from final;

  with previous as (
    select founding_unit_id, rank
    from current_founding_unit_scores
    where eligibility_status = 'ranked'
  ), unit_projects as (
    select
      pfu.founding_unit_id,
      pfu.project_id,
      pfu.attribution_fraction,
      ps.score_usd,
      ps.confidence_label,
      ps.eligibility_status,
      ps.ineligibility_reasons
    from project_founding_units pfu
    join founding_units fu on fu.id = pfu.founding_unit_id and fu.status = 'active'
    join projects p on p.id = pfu.project_id and p.status = 'active' and p.calculation_category = 'liquid_token'
    left join project_scores ps on ps.project_id = pfu.project_id and ps.calculation_run_id = v_run_id
  ), aggregates as (
    select
      founding_unit_id,
      case when bool_and(eligibility_status = 'ranked')
        then sum(score_usd * attribution_fraction)
      end as score_usd,
      bool_and(eligibility_status = 'ranked') as eligible,
      case
        when bool_or(confidence_label = 'insufficient') then 'insufficient'
        when bool_or(confidence_label = 'low') then 'low'
        when bool_or(confidence_label = 'medium') then 'medium'
        else 'high'
      end as confidence_label,
      jsonb_agg(jsonb_build_object(
        'projectId', project_id,
        'attributionFraction', attribution_fraction,
        'projectScoreUsd', score_usd,
        'attributedScoreUsd', score_usd * attribution_fraction,
        'eligibilityStatus', eligibility_status,
        'ineligibilityReasons', ineligibility_reasons
      ) order by project_id) as project_breakdown
    from unit_projects
    group by founding_unit_id
  ), reasons as (
    select
      founding_unit_id,
      coalesce(
        jsonb_agg(distinct reason_value) filter (where reason_value is not null),
        '[]'::jsonb
      ) as reasons
    from unit_projects
    left join lateral jsonb_array_elements_text(
      coalesce(ineligibility_reasons, '[]'::jsonb)
    ) reason(reason_value) on true
    group by founding_unit_id
  ), combined as (
    select aggregates.*, reasons.reasons
    from aggregates
    join reasons using (founding_unit_id)
  ), numbered as (
    select
      combined.*,
      case when eligible then row_number() over (
        partition by eligible
        order by score_usd desc, founding_unit_id
      )::integer end as new_rank
    from combined
  )
  insert into founding_unit_scores (
    calculation_run_id, founding_unit_id, score_usd, rank, previous_rank,
    rank_change, project_breakdown, confidence_label, warnings,
    eligibility_status, ineligibility_reasons
  )
  select
    v_run_id,
    n.founding_unit_id,
    n.score_usd,
    n.new_rank,
    p.rank,
    case when n.new_rank is not null and p.rank is not null then p.rank - n.new_rank end,
    n.project_breakdown,
    n.confidence_label,
    n.reasons,
    case when n.eligible then 'ranked' else 'research_in_progress' end,
    n.reasons
  from numbered n
  left join previous p on p.founding_unit_id = n.founding_unit_id;

  update calculation_runs
  set status = 'completed', completed_at = now()
  where id = v_run_id;

  return v_run_id;
exception when others then
  if v_run_id is not null then
    update calculation_runs
    set status = 'failed', completed_at = now(), error_summary = sqlerrm
    where id = v_run_id;
  end if;
  raise;
end;
$$;

create or replace view current_scores with (security_invoker = true) as
select
  projects.id as project_id,
  projects.slug,
  projects.name,
  projects.symbol,
  scores.score_usd,
  scores.market_cap_usd,
  scores.outside_holder_value_usd,
  scores.capital_raised_usd,
  scores.confidence_label,
  scores.data_freshness,
  scores.calculation_breakdown,
  scores.warnings,
  scores.calculated_at,
  scores.calculated_at is null or scores.calculated_at < now() - interval '20 minutes' as is_stale,
  case
    when scores.calculated_at is null then 'score_unavailable'
    when scores.calculated_at < now() - interval '20 minutes' then 'refresh_overdue'
  end as stale_reason,
  coalesce(scores.eligibility_status, 'ineligible') as eligibility_status,
  coalesce(scores.ineligibility_reasons, '["calculation unavailable"]'::jsonb) as ineligibility_reasons,
  projects.wallet_review_status,
  projects.funding_review_status,
  coalesce(scores.confidence_label, projects.confidence_level, 'insufficient') as reviewed_confidence,
  jsonb_build_object(
    'calculation', '/project/' || projects.slug || '#calculation',
    'marketData', '/project/' || projects.slug || '#market-data',
    'wallets', '/project/' || projects.slug || '#wallets',
    'funding', '/project/' || projects.slug || '#funding',
    'evidence', '/project/' || projects.slug || '#evidence'
  ) as calculation_links
from projects
left join current_project_scores scores on scores.project_id = projects.id
where projects.status = 'active';

-- public_leaderboard selects current_leaderboard.*, so PostgreSQL would treat
-- appended eligibility columns as renames of its existing freshness columns.
drop view if exists public_leaderboard;

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
  scores.warnings,
  coalesce(scores.eligibility_status, 'ineligible') as eligibility_status,
  coalesce(scores.ineligibility_reasons, '["calculation unavailable"]'::jsonb) as ineligibility_reasons,
  case when scores.eligibility_status = 'ranked' then 'Ranked' else 'Research in progress' end as research_status,
  coalesce(scores.confidence_label, 'insufficient') as reviewed_confidence,
  (
    select case
      when count(*) = 0 then 'not_reviewed'
      when bool_and(projects.wallet_review_status = 'approved_sufficient') then 'approved_sufficient'
      when bool_or(projects.wallet_review_status = 'in_progress') then 'in_progress'
      when bool_or(projects.wallet_review_status = 'not_reviewed') then 'not_reviewed'
      else 'reviewed_insufficient'
    end
    from project_founding_units links
    join projects on projects.id = links.project_id and projects.status = 'active'
    where links.founding_unit_id = units.id
  ) as wallet_review_status,
  (
    select case
      when count(*) = 0 then 'not_reviewed'
      when bool_and(projects.funding_review_status = 'approved_sufficient') then 'approved_sufficient'
      when bool_or(projects.funding_review_status = 'in_progress') then 'in_progress'
      when bool_or(projects.funding_review_status = 'not_reviewed') then 'not_reviewed'
      else 'reviewed_insufficient'
    end
    from project_founding_units links
    join projects on projects.id = links.project_id and projects.status = 'active'
    where links.founding_unit_id = units.id
  ) as funding_review_status,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'projectId', projects.id,
      'projectSlug', projects.slug,
      'calculation', '/project/' || projects.slug || '#calculation',
      'marketData', '/project/' || projects.slug || '#market-data',
      'wallets', '/project/' || projects.slug || '#wallets',
      'funding', '/project/' || projects.slug || '#funding',
      'evidence', '/project/' || projects.slug || '#evidence'
    ) order by projects.slug)
    from project_founding_units links
    join projects on projects.id = links.project_id and projects.status = 'active'
    where links.founding_unit_id = units.id
  ), '[]'::jsonb) as calculation_links
from founding_units units
left join current_founding_unit_scores scores on scores.founding_unit_id = units.id
where units.status = 'active'
  and exists (
    select 1
    from project_founding_units links
    join projects on projects.id = links.project_id and projects.status = 'active'
    where links.founding_unit_id = units.id
  )
order by scores.rank nulls last, units.display_name;

create view public_leaderboard with (security_invoker = true) as
select
  leaderboard.*,
  leaderboard.calculated_at is null or leaderboard.calculated_at < now() - interval '20 minutes' as is_stale,
  case
    when leaderboard.calculated_at is null then 'score_unavailable'
    when leaderboard.calculated_at < now() - interval '20 minutes' then 'refresh_overdue'
  end as stale_reason
from current_leaderboard leaderboard
order by leaderboard.rank nulls last, leaderboard.display_name;

create or replace view public_project_details with (security_invoker = true) as
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
  scores.calculated_at,
  scores.asset_id,
  scores.price_usd,
  scores.circulating_supply,
  scores.excluded_supply,
  scores.excluded_value_usd,
  scores.outside_holder_supply,
  coalesce(scores.eligibility_status, 'ineligible') as eligibility_status,
  coalesce(scores.ineligibility_reasons, '["calculation unavailable"]'::jsonb) as ineligibility_reasons,
  projects.wallet_review_status,
  projects.wallet_review_reviewer,
  projects.wallet_review_reviewed_at,
  projects.wallet_review_notes,
  projects.wallet_review_evidence_source_ids,
  projects.funding_review_status,
  projects.funding_review_reviewer,
  projects.funding_review_reviewed_at,
  projects.funding_review_notes,
  projects.funding_review_evidence_source_ids,
  coalesce(scores.confidence_label, projects.confidence_level, 'insufficient') as reviewed_confidence,
  jsonb_build_object(
    'calculation', '/project/' || projects.slug || '#calculation',
    'marketData', '/project/' || projects.slug || '#market-data',
    'wallets', '/project/' || projects.slug || '#wallets',
    'funding', '/project/' || projects.slug || '#funding',
    'evidence', '/project/' || projects.slug || '#evidence'
  ) as calculation_links
from projects
left join current_project_scores scores on scores.project_id = projects.id
where projects.status = 'active';

drop view if exists public_wallet_evidence;
create view public_wallet_evidence with (security_invoker = true) as
select
  wallets.id,
  wallets.project_id,
  wallets.founding_unit_id,
  assets.id as asset_id,
  projects.slug as project_slug,
  projects.name as project_name,
  assets.symbol as asset_symbol,
  wallets.label,
  wallets.address,
  wallets.chain_code,
  wallets.classification,
  wallets.ownership_confidence,
  wallets.circulating_inclusion_fraction,
  wallets.affects_score,
  wallets.research_reviewed_at,
  wallets.notes,
  balances.normalized_balance as balance,
  balances.observed_at as balance_observed_at,
  balances.provider as balance_provider,
  markets.price_usd,
  markets.observed_at as market_observed_at,
  case
    when wallets.affects_score
      and wallets.balance_included_in_circulating_supply
      and wallets.review_status = 'approved_sufficient'
      and wallets.circulating_inclusion_fraction is not null
      and balances.normalized_balance is not null
    then balances.normalized_balance * wallets.circulating_inclusion_fraction
  end as deductible_balance,
  case
    when wallets.affects_score
      and wallets.balance_included_in_circulating_supply
      and wallets.review_status = 'approved_sufficient'
      and wallets.circulating_inclusion_fraction is not null
      and balances.normalized_balance is not null
      and markets.price_usd is not null
    then balances.normalized_balance * wallets.circulating_inclusion_fraction * markets.price_usd
  end as deductible_value_usd,
  wallets.balance_included_in_circulating_supply,
  wallets.deduplication_key,
  wallets.review_status,
  wallets.reviewer,
  wallets.reviewed_at,
  wallets.evidence_source_ids
from tracked_wallets wallets
join projects on projects.id = wallets.project_id and projects.status = 'active'
join wallet_asset_mappings mappings on mappings.tracked_wallet_id = wallets.id
join assets on assets.id = mappings.asset_id and assets.is_active
left join lateral (
  select observation.normalized_balance, observation.observed_at, observation.provider
  from wallet_balance_observations observation
  where observation.tracked_wallet_id = wallets.id
    and observation.asset_id = assets.id
    and observation.is_valid
  order by observation.observed_at desc, observation.id desc
  limit 1
) balances on true
left join lateral (
  select observation.price_usd, observation.observed_at
  from market_observations observation
  where observation.asset_id = assets.id and observation.is_valid
  order by observation.observed_at desc, observation.id desc
  limit 1
) markets on true
where wallets.status = 'active';

comment on view current_scores is
  'Latest nullable project calculations with review state, eligibility, and exact research reasons.';
comment on view public_leaderboard is
  'Ranked and research rows; only eligible rows have contiguous ranks and score values.';

grant select on current_scores, current_leaderboard, public_leaderboard,
  public_project_details, public_wallet_evidence to anon;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant select on current_scores, current_leaderboard, public_leaderboard, public_project_details, public_wallet_evidence to authenticated';
  end if;
end;
$$;
