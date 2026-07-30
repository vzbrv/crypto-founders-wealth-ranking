-- Treat legacy scalar JSONB review evidence as incomplete rather than raising.

alter table projects
  drop constraint projects_wallet_completed_review_metadata,
  drop constraint projects_funding_completed_review_metadata;

alter table projects
  add constraint projects_wallet_completed_review_metadata check (
    wallet_review_status not in ('approved_sufficient', 'reviewed_insufficient')
    or (
      wallet_review_reviewer is not null
      and wallet_review_reviewed_at is not null
      and wallet_review_notes is not null
      and jsonb_typeof(wallet_review_evidence_source_ids) = 'array'
      and wallet_review_evidence_source_ids <> '[]'::jsonb
    )
  ),
  add constraint projects_funding_completed_review_metadata check (
    funding_review_status not in ('approved_sufficient', 'reviewed_insufficient')
    or (
      funding_review_reviewer is not null
      and funding_review_reviewed_at is not null
      and funding_review_notes is not null
      and jsonb_typeof(funding_review_evidence_source_ids) = 'array'
      and funding_review_evidence_source_ids <> '[]'::jsonb
    )
  );

do $migration$
declare
  function_definition text;
  unsafe_expression text;
  safe_expression text;
begin
  function_definition := pg_get_functiondef(
    'public.recalculate_rankings(text)'::regprocedure
  );

  for unsafe_expression, safe_expression in
    select *
    from (
      values
        (
          'jsonb_array_length(awm.evidence_source_ids) > 0',
          'jsonb_typeof(awm.evidence_source_ids) = ''array'' and awm.evidence_source_ids <> ''[]''::jsonb'
        ),
        (
          'jsonb_array_length(evidence_source_ids) > 0',
          'jsonb_typeof(evidence_source_ids) = ''array'' and evidence_source_ids <> ''[]''::jsonb'
        ),
        (
          'jsonb_array_length(wallet_review_evidence_source_ids) > 0',
          'jsonb_typeof(wallet_review_evidence_source_ids) = ''array'' and wallet_review_evidence_source_ids <> ''[]''::jsonb'
        ),
        (
          'jsonb_array_length(funding_review_evidence_source_ids) > 0',
          'jsonb_typeof(funding_review_evidence_source_ids) = ''array'' and funding_review_evidence_source_ids <> ''[]''::jsonb'
        )
    ) replacements(unsafe_expression, safe_expression)
  loop
    if position(unsafe_expression in function_definition) = 0 then
      raise exception
        'Expected unsafe expression missing from recalculate_rankings: %',
        unsafe_expression;
    end if;

    function_definition := replace(
      function_definition,
      unsafe_expression,
      safe_expression
    );
  end loop;

  if position('jsonb_array_length(' in function_definition) > 0 then
    raise exception
      'Unexpected unsafe JSONB array length check remains in recalculate_rankings';
  end if;

  execute function_definition;
end;
$migration$;
