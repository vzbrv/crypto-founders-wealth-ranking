do $migration$
declare
  function_definition text;
  rollup_start integer;
  inputs_start integer;
  replacement text := $replacement$
  ), active_funding_events as (
    select
      funding.*,
      coalesce((
        funding.review_status = 'approved_sufficient'
        and funding.reviewer is not null
        and btrim(funding.reviewer) <> ''
        and funding.reviewed_at is not null
        and btrim(funding.inclusion_reason) <> ''
        and btrim(funding.deduplication_key) <> ''
        and case
          when jsonb_typeof(funding.evidence_source_ids) = 'array'
            and funding.evidence_source_ids <> '[]'::jsonb
          then not exists (
            select 1
            from jsonb_array_elements_text(funding.evidence_source_ids) as evidence(source_id)
            where not exists (
              select 1
              from source_records as source
              join record_sources as link
                on link.source_record_id = source.id
              where source.id::text = evidence.source_id
                and source.status = 'active'
                and link.record_type = 'funding_round'
                and link.record_id = funding.id
                and link.support_type in ('primary', 'corroborating')
            )
          )
          else false
        end
        and (
          not funding.include_in_capital_deduction
          or (
            funding.amount_status = 'exact'
            and funding.amount_usd_at_event is not null
            and funding.usd_conversion_method is not null
            and btrim(funding.usd_conversion_method) <> ''
          )
        )
      ), false) as review_complete
    from funding_rounds as funding
    where funding.status = 'active'
  ), funding_rollup as (
    select
      project_id,
      count(*) as required_count,
      bool_and(review_complete) as all_reviewed,
      sum(
        case
          when include_in_capital_deduction and review_complete
          then amount_usd_at_event
        end
      ) as capital_raised
    from active_funding_events
    group by project_id
  $replacement$;
begin
  function_definition := pg_get_functiondef(
    'recalculate_rankings(text)'::regprocedure
  );
  rollup_start := position('  ), funding_rollup as (' in function_definition);
  inputs_start := position('  ), inputs as (' in function_definition);

  if rollup_start = 0 or inputs_start = 0 or inputs_start <= rollup_start then
    raise exception 'Unable to locate funding rollup in recalculate_rankings';
  end if;

  function_definition :=
    substring(function_definition from 1 for rollup_start - 1)
    || replacement
    || substring(function_definition from inputs_start);

  execute function_definition;
end;
$migration$;
