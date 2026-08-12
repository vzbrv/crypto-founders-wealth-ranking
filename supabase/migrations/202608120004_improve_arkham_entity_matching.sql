insert into public.arkham_entity_mappings (
  project_id,
  founding_unit_id,
  searched_alias,
  entity_found,
  entity_id,
  entity_name,
  discovery_status,
  owner_class,
  attribution_class,
  review_status,
  ownership_confidence,
  score_affecting,
  exclusion_reason,
  stable_deduplication_key,
  source_endpoint,
  source_evidence_ids,
  notes,
  observed_at
)
select
  p.id,
  null,
  'Solana',
  true,
  'solana',
  'Solana',
  'found',
  'unknown',
  'confirmed_entity',
  'candidate',
  'disputed',
  false,
  'Umbrella entity is research-only until ownership is attributed to a specific founding unit',
  'arkham-audit:solana:solana',
  '/intelligence/search',
  array['manual-review:2026-08-12:arkham-candidate-export'],
  'Arkham search returned the same umbrella entity for Solana Labs and Solana Foundation',
  now()
from public.projects p
where p.slug = 'solana' and p.status = 'active'
on conflict (stable_deduplication_key) do update set
  entity_found = excluded.entity_found,
  entity_id = excluded.entity_id,
  entity_name = excluded.entity_name,
  discovery_status = excluded.discovery_status,
  owner_class = excluded.owner_class,
  review_status = excluded.review_status,
  ownership_confidence = excluded.ownership_confidence,
  score_affecting = excluded.score_affecting,
  exclusion_reason = excluded.exclusion_reason,
  source_evidence_ids = excluded.source_evidence_ids,
  notes = excluded.notes,
  observed_at = excluded.observed_at,
  updated_at = now();

update public.arkham_entity_mappings m
set
  entity_found = null,
  entity_id = null,
  entity_name = null,
  discovery_status = 'ambiguous',
  review_status = 'candidate',
  ownership_confidence = 'disputed',
  score_affecting = false,
  exclusion_reason = 'Arkham returned the umbrella Solana entity; specific Labs or Foundation ownership is unresolved',
  notes = 'Use the separate project-level Solana mapping for research-only coverage',
  updated_at = now()
from public.projects p
where m.project_id = p.id
  and p.slug = 'solana'
  and m.searched_alias in ('Solana Labs', 'Solana Foundation');
