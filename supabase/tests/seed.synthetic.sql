begin;

insert into projects (
  id, slug, name, symbol, description, project_type, calculation_category,
  status, confidence_level, methodology_notes, website_url, launched_at,
  research_reviewed_at, wallet_review_status, wallet_review_reviewer,
  wallet_review_reviewed_at, wallet_review_notes,
  wallet_review_evidence_source_ids, funding_review_status,
  funding_review_reviewer, funding_review_reviewed_at, funding_review_notes,
  funding_review_evidence_source_ids
) values (
  '11111111-1111-4111-8111-111111111111', 'synthetic-horizon',
  'Synthetic Horizon Protocol', 'SYN',
  'Synthetic fixture for schema and reference validation only.', 'protocol',
  'liquid_token', 'active', 'high',
  'Synthetic values; never publish as real wealth data.',
  'https://example.com/projects/synthetic-horizon', '2025-01-15',
  '2026-07-27T12:00:00Z', 'approved_sufficient', 'Synthetic reviewer',
  '2026-07-27T12:00:00Z', 'Synthetic wallet scope reviewed.',
  '["44444444-4444-4444-8444-444444444444"]', 'approved_sufficient',
  'Synthetic reviewer', '2026-07-27T12:00:00Z',
  'Synthetic funding ledger reviewed.',
  '["44444444-4444-4444-8444-444444444444"]'
) on conflict (id) do update set
  slug = excluded.slug, name = excluded.name, symbol = excluded.symbol,
  description = excluded.description, project_type = excluded.project_type,
  calculation_category = excluded.calculation_category, status = excluded.status,
  confidence_level = excluded.confidence_level,
  methodology_notes = excluded.methodology_notes,
  website_url = excluded.website_url, launched_at = excluded.launched_at,
  research_reviewed_at = excluded.research_reviewed_at,
  wallet_review_status = excluded.wallet_review_status,
  wallet_review_reviewer = excluded.wallet_review_reviewer,
  wallet_review_reviewed_at = excluded.wallet_review_reviewed_at,
  wallet_review_notes = excluded.wallet_review_notes,
  wallet_review_evidence_source_ids = excluded.wallet_review_evidence_source_ids,
  funding_review_status = excluded.funding_review_status,
  funding_review_reviewer = excluded.funding_review_reviewer,
  funding_review_reviewed_at = excluded.funding_review_reviewed_at,
  funding_review_notes = excluded.funding_review_notes,
  funding_review_evidence_source_ids = excluded.funding_review_evidence_source_ids,
  updated_at = now();

insert into founding_units (
  id, slug, display_name, description, entity_type, status, research_reviewed_at
) values (
  '22222222-2222-4222-8222-222222222222', 'synthetic-horizon-team',
  'Synthetic Horizon Founding Team',
  'Fictional team used only for validation.', 'team', 'active',
  '2026-07-27T12:00:00Z'
) on conflict (id) do update set
  slug = excluded.slug, display_name = excluded.display_name,
  description = excluded.description, entity_type = excluded.entity_type,
  status = excluded.status, research_reviewed_at = excluded.research_reviewed_at,
  updated_at = now();

insert into project_founding_units (
  project_id, founding_unit_id, attribution_fraction, attribution_method
) values (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222', 1, 'team_collective'
) on conflict (project_id, founding_unit_id) do update set
  attribution_fraction = excluded.attribution_fraction,
  attribution_method = excluded.attribution_method;

insert into assets (
  id, project_id, asset_type, symbol, name, decimals, chain_code,
  contract_address, coingecko_id, provider_ids, is_primary, is_active
) values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111', 'token', 'SYN',
  'Synthetic Horizon Token', 18, 'ethereum',
  '0x1111111111111111111111111111111111111111',
  'synthetic-horizon-token', '{"synthetic":"synthetic-horizon-token"}', true, true
) on conflict (id) do update set
  project_id = excluded.project_id, asset_type = excluded.asset_type,
  symbol = excluded.symbol, name = excluded.name, decimals = excluded.decimals,
  chain_code = excluded.chain_code,
  contract_address = excluded.contract_address,
  coingecko_id = excluded.coingecko_id,
  provider_ids = excluded.provider_ids, is_primary = excluded.is_primary,
  is_active = excluded.is_active, updated_at = now();

insert into source_records (
  id, title, url, publisher, source_type, published_at, accessed_at,
  description, status
) values (
  '44444444-4444-4444-8444-444444444444',
  'Synthetic Horizon fixture source',
  'https://example.com/research/synthetic-horizon', 'Example Research',
  'official_documentation', '2026-07-26T09:00:00Z',
  '2026-07-27T12:00:00Z',
  'Fictional source used only to exercise claim-level provenance.', 'active'
) on conflict (id) do update set
  title = excluded.title, url = excluded.url, publisher = excluded.publisher,
  source_type = excluded.source_type, published_at = excluded.published_at,
  accessed_at = excluded.accessed_at, description = excluded.description,
  status = excluded.status, updated_at = now();

insert into tracked_wallets (
  id, project_id, founding_unit_id, chain_code, address, normalized_address,
  label, classification, ownership_confidence, circulating_inclusion_fraction,
  affects_score, status, research_reviewed_at, notes,
  balance_included_in_circulating_supply, deduplication_key, review_status,
  reviewer, reviewed_at, evidence_source_ids
) values (
  '55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222', 'ethereum',
  '0x2222222222222222222222222222222222222222',
  '0x2222222222222222222222222222222222222222',
  'Synthetic founder wallet', 'founder', 'high', 0.75, true, 'active',
  '2026-07-27T12:00:00Z',
  'Fictional address and balance scope for validation only.', true,
  'synthetic-horizon-team-wallet', 'approved_sufficient',
  'Synthetic reviewer', '2026-07-27T12:00:00Z',
  '["44444444-4444-4444-8444-444444444444"]'
) on conflict (id) do update set
  project_id = excluded.project_id,
  founding_unit_id = excluded.founding_unit_id,
  chain_code = excluded.chain_code, address = excluded.address,
  normalized_address = excluded.normalized_address, label = excluded.label,
  classification = excluded.classification,
  ownership_confidence = excluded.ownership_confidence,
  circulating_inclusion_fraction = excluded.circulating_inclusion_fraction,
  affects_score = excluded.affects_score, status = excluded.status,
  research_reviewed_at = excluded.research_reviewed_at,
  notes = excluded.notes,
  balance_included_in_circulating_supply = excluded.balance_included_in_circulating_supply,
  deduplication_key = excluded.deduplication_key,
  review_status = excluded.review_status, reviewer = excluded.reviewer,
  reviewed_at = excluded.reviewed_at,
  evidence_source_ids = excluded.evidence_source_ids, updated_at = now();

insert into wallet_asset_mappings (
  tracked_wallet_id, asset_id, balance_query_type, token_identifier
) values (
  '55555555-5555-4555-8555-555555555555',
  '33333333-3333-4333-8333-333333333333', 'erc20',
  '0x1111111111111111111111111111111111111111'
) on conflict (tracked_wallet_id, asset_id) do update set
  balance_query_type = excluded.balance_query_type,
  token_identifier = excluded.token_identifier;

insert into funding_rounds (
  id, project_id, event_date, round_type, original_amount, original_currency,
  amount_usd_at_event, amount_status, usd_conversion_method,
  usd_conversion_date, include_in_capital_deduction, inclusion_reason, status,
  reviewed_at, notes, deduplication_key, review_status, reviewer, evidence_source_ids
) values (
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111', '2025-01-10', 'seed', 2500000,
  'USD', 2500000, 'exact', 'Already denominated in USD.', '2025-01-10', true,
  'Included in the synthetic capital-raised deduction.', 'active',
  '2026-07-27T12:00:00Z',
  'Synthetic funding event for validation only.', 'synthetic-horizon-seed',
  'approved_sufficient', 'Synthetic reviewer',
  '["44444444-4444-4444-8444-444444444444"]'
) on conflict (id) do update set
  project_id = excluded.project_id, event_date = excluded.event_date,
  round_type = excluded.round_type, original_amount = excluded.original_amount,
  original_currency = excluded.original_currency,
  amount_usd_at_event = excluded.amount_usd_at_event,
  amount_status = excluded.amount_status,
  usd_conversion_method = excluded.usd_conversion_method,
  usd_conversion_date = excluded.usd_conversion_date,
  include_in_capital_deduction = excluded.include_in_capital_deduction,
  inclusion_reason = excluded.inclusion_reason,
  status = excluded.status, reviewed_at = excluded.reviewed_at,
  notes = excluded.notes, deduplication_key = excluded.deduplication_key,
  review_status = excluded.review_status, reviewer = excluded.reviewer,
  evidence_source_ids = excluded.evidence_source_ids, updated_at = now();

insert into record_sources (
  id, record_type, record_id, field, source_record_id, support_type
) values
  ('70000000-0000-4000-8000-000000000001', 'project', '11111111-1111-4111-8111-111111111111', 'identity', '44444444-4444-4444-8444-444444444444', 'primary'),
  ('70000000-0000-4000-8000-000000000002', 'founding_unit', '22222222-2222-4222-8222-222222222222', 'projectLinks[0]', '44444444-4444-4444-8444-444444444444', 'primary'),
  ('70000000-0000-4000-8000-000000000003', 'asset', '33333333-3333-4333-8333-333333333333', 'identity', '44444444-4444-4444-8444-444444444444', 'primary'),
  ('70000000-0000-4000-8000-000000000004', 'tracked_wallet', '55555555-5555-4555-8555-555555555555', 'ownership', '44444444-4444-4444-8444-444444444444', 'primary'),
  ('70000000-0000-4000-8000-000000000005', 'funding_round', '66666666-6666-4666-8666-666666666666', 'amountUsdAtEvent', '44444444-4444-4444-8444-444444444444', 'primary')
on conflict (id) do update set
  record_type = excluded.record_type, record_id = excluded.record_id,
  field = excluded.field, source_record_id = excluded.source_record_id,
  support_type = excluded.support_type;

commit;
