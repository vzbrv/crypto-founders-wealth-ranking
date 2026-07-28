import type { CuratedDataBundle } from "@crypto-founders/schemas";
import type postgres from "postgres";

export type SqlStatement = {
  text: string;
  values: readonly postgres.SerializableParameter[];
};

export type CuratedImportSummary = {
  projects: number;
  foundingUnits: number;
  projectFoundingUnits: number;
  assets: number;
  sources: number;
  wallets: number;
  walletAssetMappings: number;
  fundingRounds: number;
  recordSources: number;
};

const statement = (
  text: string,
  ...values: readonly postgres.SerializableParameter[]
): SqlStatement => ({ text, values });

export function createCuratedImportStatements(
  bundle: CuratedDataBundle,
): SqlStatement[] {
  const statements: SqlStatement[] = [];

  for (const project of bundle.projects) {
    statements.push(
      statement(
        `insert into projects (
          id, slug, name, symbol, description, project_type,
          calculation_category, status, confidence_level, methodology_notes,
          iq_wiki_slug, website_url, launched_at, research_reviewed_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        on conflict (id) do update set
          slug = excluded.slug, name = excluded.name, symbol = excluded.symbol,
          description = excluded.description, project_type = excluded.project_type,
          calculation_category = excluded.calculation_category, status = excluded.status,
          confidence_level = excluded.confidence_level, methodology_notes = excluded.methodology_notes,
          iq_wiki_slug = excluded.iq_wiki_slug, website_url = excluded.website_url,
          launched_at = excluded.launched_at, research_reviewed_at = excluded.research_reviewed_at,
          updated_at = now()`,
        project.id,
        project.slug,
        project.name,
        project.symbol ?? null,
        project.description,
        project.projectType,
        project.calculationCategory,
        project.status,
        project.confidenceLevel,
        project.methodologyNotes,
        project.iqWikiSlug ?? null,
        project.websiteUrl,
        project.launchedAt ?? null,
        project.researchReviewedAt,
      ),
    );
  }

  for (const unit of bundle.foundingUnits) {
    statements.push(
      statement(
        `insert into founding_units (
          id, slug, display_name, description, image_url, iq_wiki_slug,
          entity_type, status, research_reviewed_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (id) do update set
          slug = excluded.slug, display_name = excluded.display_name,
          description = excluded.description, image_url = excluded.image_url,
          iq_wiki_slug = excluded.iq_wiki_slug, entity_type = excluded.entity_type,
          status = excluded.status, research_reviewed_at = excluded.research_reviewed_at,
          updated_at = now()`,
        unit.id,
        unit.slug,
        unit.displayName,
        unit.description,
        unit.imageUrl ?? null,
        unit.iqWikiSlug ?? null,
        unit.entityType,
        unit.status,
        unit.researchReviewedAt,
      ),
    );
    for (const link of unit.projectLinks) {
      statements.push(
        statement(
          `insert into project_founding_units (
            project_id, founding_unit_id, attribution_fraction, attribution_method
          ) values ($1, $2, $3, $4)
          on conflict (project_id, founding_unit_id) do update set
            attribution_fraction = excluded.attribution_fraction,
            attribution_method = excluded.attribution_method`,
          link.projectId,
          unit.id,
          link.attributionFraction,
          link.attributionMethod,
        ),
      );
    }
  }

  for (const asset of bundle.assets) {
    statements.push(
      statement(
        `insert into assets (
          id, project_id, asset_type, symbol, name, decimals, chain_code,
          contract_address, coingecko_id, coinbase_product_id, binance_symbol,
          dex_screener_pair, provider_ids, is_primary, is_active
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)
        on conflict (id) do update set
          project_id = excluded.project_id, asset_type = excluded.asset_type,
          symbol = excluded.symbol, name = excluded.name, decimals = excluded.decimals,
          chain_code = excluded.chain_code, contract_address = excluded.contract_address,
          coingecko_id = excluded.coingecko_id, coinbase_product_id = excluded.coinbase_product_id,
          binance_symbol = excluded.binance_symbol, dex_screener_pair = excluded.dex_screener_pair,
          provider_ids = excluded.provider_ids, is_primary = excluded.is_primary,
          is_active = excluded.is_active, updated_at = now()`,
        asset.id,
        asset.projectId,
        asset.assetType,
        asset.symbol,
        asset.name,
        asset.decimals,
        asset.chainCode,
        asset.contractAddress ?? null,
        asset.providerIds.coingecko ?? null,
        asset.providerIds.coinbase ?? null,
        asset.providerIds.binance ?? null,
        asset.providerIds.dexScreener ?? null,
        JSON.stringify(asset.providerIds),
        asset.isPrimary,
        asset.isActive,
      ),
    );
  }

  for (const source of bundle.sources) {
    statements.push(
      statement(
        `insert into source_records (
          id, title, url, publisher, source_type, published_at, accessed_at,
          description, status
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (id) do update set
          title = excluded.title, url = excluded.url, publisher = excluded.publisher,
          source_type = excluded.source_type, published_at = excluded.published_at,
          accessed_at = excluded.accessed_at, description = excluded.description,
          status = excluded.status, updated_at = now()`,
        source.id,
        source.title,
        source.url,
        source.publisher ?? null,
        source.sourceType,
        source.publishedAt ?? null,
        source.accessedAt,
        source.description,
        source.status,
      ),
    );
  }

  const assetsById = new Map(bundle.assets.map((asset) => [asset.id, asset]));
  for (const wallet of bundle.wallets) {
    statements.push(
      statement(
        `insert into tracked_wallets (
          id, project_id, founding_unit_id, chain_code, address, normalized_address,
          label, owner_name, classification, ownership_confidence,
          circulating_inclusion_fraction, affects_score, status, research_reviewed_at, notes
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        on conflict (id) do update set
          project_id = excluded.project_id, founding_unit_id = excluded.founding_unit_id,
          chain_code = excluded.chain_code, address = excluded.address,
          normalized_address = excluded.normalized_address, label = excluded.label,
          owner_name = excluded.owner_name, classification = excluded.classification,
          ownership_confidence = excluded.ownership_confidence,
          circulating_inclusion_fraction = excluded.circulating_inclusion_fraction,
          affects_score = excluded.affects_score, status = excluded.status,
          research_reviewed_at = excluded.research_reviewed_at, notes = excluded.notes,
          updated_at = now()`,
        wallet.id,
        wallet.projectId,
        wallet.foundingUnitId ?? null,
        wallet.chainCode,
        wallet.address,
        wallet.normalizedAddress,
        wallet.label,
        wallet.ownerName ?? null,
        wallet.classification,
        wallet.ownershipConfidence,
        wallet.circulatingInclusionFraction,
        wallet.affectsScore,
        wallet.status,
        wallet.researchReviewedAt,
        wallet.notes ?? null,
      ),
    );
    for (const assetId of wallet.assetIds) {
      const asset = assetsById.get(assetId);
      const balanceQueryType =
        asset?.assetType === "native"
          ? "native"
          : asset?.contractAddress
            ? "erc20"
            : "token";
      statements.push(
        statement(
          `insert into wallet_asset_mappings (
            tracked_wallet_id, asset_id, balance_query_type, token_identifier
          ) values ($1, $2, $3, $4)
          on conflict (tracked_wallet_id, asset_id) do update set
            balance_query_type = excluded.balance_query_type,
            token_identifier = excluded.token_identifier`,
          wallet.id,
          assetId,
          balanceQueryType,
          asset?.contractAddress ?? null,
        ),
      );
    }
  }

  for (const round of bundle.fundingRounds) {
    statements.push(
      statement(
        `insert into funding_rounds (
          id, project_id, event_date, round_type, original_amount,
          original_currency, amount_usd_at_event, usd_conversion_method,
          include_in_capital_deduction, status, reviewed_at, notes
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        on conflict (id) do update set
          project_id = excluded.project_id, event_date = excluded.event_date,
          round_type = excluded.round_type, original_amount = excluded.original_amount,
          original_currency = excluded.original_currency,
          amount_usd_at_event = excluded.amount_usd_at_event,
          usd_conversion_method = excluded.usd_conversion_method,
          include_in_capital_deduction = excluded.include_in_capital_deduction,
          status = excluded.status, reviewed_at = excluded.reviewed_at,
          notes = excluded.notes, updated_at = now()`,
        round.id,
        round.projectId,
        round.eventDate,
        round.roundType,
        round.originalAmount ?? null,
        round.originalCurrency ?? null,
        round.amountUsdAtEvent ?? null,
        round.conversionMethod ?? null,
        round.includeInCapitalDeduction,
        round.status,
        round.reviewedAt,
        round.notes ?? null,
      ),
    );
  }

  for (const link of bundle.recordSources) {
    statements.push(
      statement(
        `insert into record_sources (
          id, record_type, record_id, field, source_record_id, support_type, notes
        ) values ($1, $2, $3, $4, $5, $6, $7)
        on conflict (id) do update set
          record_type = excluded.record_type, record_id = excluded.record_id,
          field = excluded.field, source_record_id = excluded.source_record_id,
          support_type = excluded.support_type, notes = excluded.notes`,
        link.id,
        link.recordType,
        link.recordId,
        link.field,
        link.sourceId,
        link.supportType,
        link.notes ?? null,
      ),
    );
  }

  return statements;
}

export function summarizeCuratedImport(
  bundle: CuratedDataBundle,
): CuratedImportSummary {
  return {
    projects: bundle.projects.length,
    foundingUnits: bundle.foundingUnits.length,
    projectFoundingUnits: bundle.foundingUnits.reduce(
      (count, unit) => count + unit.projectLinks.length,
      0,
    ),
    assets: bundle.assets.length,
    sources: bundle.sources.length,
    wallets: bundle.wallets.length,
    walletAssetMappings: bundle.wallets.reduce(
      (count, wallet) => count + wallet.assetIds.length,
      0,
    ),
    fundingRounds: bundle.fundingRounds.length,
    recordSources: bundle.recordSources.length,
  };
}
