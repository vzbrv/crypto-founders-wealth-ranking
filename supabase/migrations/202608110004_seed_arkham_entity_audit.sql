insert into public.arkham_entity_mappings (
  project_id, founding_unit_id, searched_alias, entity_found, discovery_status,
  owner_class, attribution_class, review_status, ownership_confidence,
  score_affecting, stable_deduplication_key, source_endpoint, notes
)
select
  p.id,
  f.id,
  v.searched_alias,
  null,
  'unrun',
  v.owner_class,
  'confirmed_entity',
  'candidate',
  'disputed',
  false,
  'arkham-audit:' || v.project_slug || ':' || lower(regexp_replace(v.searched_alias, '[^a-zA-Z0-9]+', '-', 'g')),
  '/intelligence/search',
  v.notes
from (values
  ('bitcoin','Satoshi Nakamoto','founder','Patoshi-pattern cluster; attribution and completeness disputed'),
  ('ethereum','Vitalik Buterin','founder','Individual coverage only'),
  ('ethereum','Anthony Di Iorio','founder','Coverage required separately'),
  ('ethereum','Charles Hoskinson','founder','Coverage required separately'),
  ('ethereum','Mihai Alisie','founder','Coverage required separately'),
  ('ethereum','Amir Chetrit','founder','Coverage required separately'),
  ('ethereum','Joseph Lubin','founder','Coverage required separately'),
  ('ethereum','Gavin Wood','founder','Coverage required separately'),
  ('ethereum','Jeffrey Wilcke','founder','Coverage required separately'),
  ('ethereum','Ethereum Foundation','foundation','Do not infer coverage from Vitalik'),
  ('bnb','Changpeng Zhao','founder','Founder-specific attribution required'),
  ('bnb','CZ','founder','Alias must not be silently merged'),
  ('bnb','Yi He','founder','Founder-specific attribution required'),
  ('bnb','Binance','custodial','Exchange/customer assets excluded by default'),
  ('bnb','Binance Labs','company','Corporate attribution requires review'),
  ('xrp','Chris Larsen','founder','Preserve Unknown if unsupported'),
  ('xrp','Jed McCaleb','founder','Preserve Unknown if unsupported'),
  ('xrp','Arthur Britto','founder','Preserve Unknown if unsupported'),
  ('xrp','Ripple','company','Corporate attribution requires review'),
  ('solana','Anatoly Yakovenko','founder','Rumored addresses remain non-scoring'),
  ('solana','Raj Gokal','founder','Founder-specific attribution required'),
  ('solana','Solana Labs','company','Corporate attribution requires review'),
  ('solana','Solana Foundation','foundation','Foundation attribution requires review'),
  ('tron','Justin Sun','founder','Separate from HTX customer holdings'),
  ('tron','TRON Foundation','foundation','Separate from Justin Sun'),
  ('tron','TRON DAO','treasury','Separate from Justin Sun'),
  ('tron','JUST','company','Do not merge contracts automatically'),
  ('hyperliquid','Jeff Yan','founder','Check HyperEVM and HyperCore separately'),
  ('hyperliquid','Hyperliquid Labs','company','Check HyperEVM and HyperCore separately'),
  ('hyperliquid','Hyperliquid Foundation','foundation','Check HyperEVM and HyperCore separately'),
  ('dogecoin','Billy Markus','founder','Preserve Unknown if unsupported'),
  ('dogecoin','Jackson Palmer','founder','Preserve Unknown if unsupported'),
  ('chainlink','Sergey Nazarov','founder','Founder-specific attribution required'),
  ('chainlink','Steve Ellis','founder','Founder-specific attribution required'),
  ('chainlink','Chainlink Labs','company','Corporate attribution requires review'),
  ('chainlink','Chainlink Foundation','foundation','Foundation attribution requires review'),
  ('cardano','Charles Hoskinson','founder','Founder-specific attribution required'),
  ('cardano','Jeremy Wood','founder','Founder-specific attribution required'),
  ('cardano','IOHK','company','Corporate attribution requires review'),
  ('cardano','IOG','company','Alias must not be silently merged'),
  ('cardano','Cardano Foundation','foundation','Preserve Unknown if unsupported')
) as v(project_slug, searched_alias, owner_class, notes)
join public.projects p on p.slug = v.project_slug and p.status = 'active'
left join lateral (
  select f.id
  from public.founding_units f
  join public.project_founding_units pfu on pfu.founding_unit_id = f.id
  where pfu.project_id = p.id
    and lower(f.display_name) = lower(v.searched_alias)
  order by pfu.id
  limit 1
) f on true
on conflict (stable_deduplication_key) do nothing;
