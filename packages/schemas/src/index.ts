import { z } from "zod";

const isIsoDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
};

const isIsoDateTime = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
};

export const uuidSchema = z.string().uuid();
export const urlSchema = z.string().url();
export const dateSchema = z
  .string()
  .refine(isIsoDate, "Expected an ISO date (YYYY-MM-DD)");
export const dateTimeSchema = z
  .string()
  .refine(isIsoDateTime, "Expected an ISO 8601 timestamp with timezone");
export const decimalSchema = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/, "Expected an unsigned decimal string");
export const fractionSchema = z
  .string()
  .regex(
    /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/,
    "Expected a decimal fraction from 0 to 1",
  );

const statusSchema = z.enum(["active", "hidden", "research"]);
const confidenceSchema = z.enum(["high", "medium", "low", "insufficient"]);

export const projectSchema = z.strictObject({
  id: uuidSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  symbol: z.string().min(1).optional(),
  description: z.string().min(1),
  projectType: z.enum(["blockchain", "protocol", "token"]),
  calculationCategory: z.enum(["liquid_token", "ineligible"]),
  status: statusSchema,
  confidenceLevel: confidenceSchema,
  methodologyNotes: z.string().min(1),
  iqWikiSlug: z.string().min(1).optional(),
  websiteUrl: urlSchema,
  launchedAt: dateSchema.optional(),
  researchReviewedAt: dateTimeSchema,
});

export const foundingUnitSchema = z.strictObject({
  id: uuidSchema,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  displayName: z.string().min(1),
  description: z.string().min(1),
  imageUrl: urlSchema.optional(),
  iqWikiSlug: z.string().min(1).optional(),
  entityType: z.enum(["individual", "team"]),
  status: statusSchema,
  researchReviewedAt: dateTimeSchema,
  projectLinks: z
    .array(
      z.strictObject({
        projectId: uuidSchema,
        attributionFraction: fractionSchema,
        attributionMethod: z.enum([
          "equal_split",
          "documented_split",
          "team_collective",
        ]),
      }),
    )
    .min(1),
});

export const assetSchema = z.strictObject({
  id: uuidSchema,
  projectId: uuidSchema,
  assetType: z.enum(["native", "token"]),
  symbol: z.string().min(1),
  name: z.string().min(1),
  decimals: z.number().int().min(0).max(255),
  chainCode: z.string().min(1),
  contractAddress: z.string().min(1).optional(),
  providerIds: z.record(z.string(), z.string().min(1)).default({}),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
});

const evmAddressPattern = /^0x[a-fA-F0-9]{40}$/;
const bitcoinAddressPattern =
  /^(?:bc1[a-zA-HJ-NP-Z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/;
const solanaAddressPattern = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const walletSchema = z
  .strictObject({
    id: uuidSchema,
    projectId: uuidSchema,
    foundingUnitId: uuidSchema.optional(),
    assetIds: z.array(uuidSchema).min(1),
    chainCode: z.enum(["ethereum", "bitcoin", "solana"]),
    address: z.string().min(1),
    normalizedAddress: z.string().min(1),
    label: z.string().min(1),
    ownerName: z.string().min(1).optional(),
    classification: z.enum([
      "founder",
      "cofounder",
      "founder_controlled_company",
      "team",
      "foundation",
      "treasury",
      "employee_pool",
      "affiliate",
      "unknown",
    ]),
    ownershipConfidence: z.enum(["high", "medium", "low", "disputed"]),
    circulatingInclusionFraction: fractionSchema.nullable(),
    affectsScore: z.boolean(),
    status: statusSchema,
    researchReviewedAt: dateTimeSchema,
    notes: z.string().min(1).optional(),
  })
  .superRefine((wallet, context) => {
    const patterns = {
      ethereum: evmAddressPattern,
      bitcoin: bitcoinAddressPattern,
      solana: solanaAddressPattern,
    } as const;
    if (!patterns[wallet.chainCode].test(wallet.address)) {
      context.addIssue({
        code: "custom",
        message: `Invalid ${wallet.chainCode} wallet address`,
        path: ["address"],
      });
    }
    const expected =
      wallet.chainCode === "ethereum"
        ? wallet.address.toLowerCase()
        : wallet.address;
    if (wallet.normalizedAddress !== expected) {
      context.addIssue({
        code: "custom",
        message: "normalizedAddress does not match the canonical address",
        path: ["normalizedAddress"],
      });
    }
    if (wallet.affectsScore && wallet.circulatingInclusionFraction === null) {
      context.addIssue({
        code: "custom",
        message: "A score-affecting wallet requires a circulation fraction",
        path: ["circulatingInclusionFraction"],
      });
    }
  });

export const fundingRoundSchema = z
  .strictObject({
    id: uuidSchema,
    projectId: uuidSchema,
    eventDate: dateSchema,
    roundType: z.enum([
      "pre_seed",
      "seed",
      "private",
      "strategic",
      "public",
      "other",
    ]),
    originalAmount: decimalSchema.optional(),
    originalCurrency: z.string().min(1).optional(),
    amountUsdAtEvent: decimalSchema.optional(),
    conversionMethod: z.string().min(1).optional(),
    includeInCapitalDeduction: z.boolean(),
    status: statusSchema,
    reviewedAt: dateTimeSchema,
    notes: z.string().min(1).optional(),
  })
  .superRefine((round, context) => {
    if (
      round.includeInCapitalDeduction &&
      round.amountUsdAtEvent === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Included funding requires amountUsdAtEvent",
        path: ["amountUsdAtEvent"],
      });
    }
  });

export const sourceSchema = z.strictObject({
  id: uuidSchema,
  title: z.string().min(1),
  url: urlSchema,
  publisher: z.string().min(1).optional(),
  sourceType: z.enum([
    "official_website",
    "official_blog",
    "official_documentation",
    "regulatory_filing",
    "block_explorer",
    "press_release",
    "reputable_media",
    "research_report",
    "social_post",
    "other",
  ]),
  publishedAt: dateTimeSchema.optional(),
  accessedAt: dateTimeSchema,
  description: z.string().min(1),
  status: z.enum(["active", "broken", "superseded"]),
});

export const recordSourceSchema = z.strictObject({
  id: uuidSchema,
  sourceId: uuidSchema,
  recordType: z.enum([
    "project",
    "founding_unit",
    "asset",
    "tracked_wallet",
    "funding_round",
  ]),
  recordId: uuidSchema,
  field: z.string().min(1),
  supportType: z.enum(["primary", "corroborating", "contradicting"]),
  notes: z.string().min(1).optional(),
});

export const curatedDataBundleBaseSchema = z.strictObject({
  projects: z.array(projectSchema),
  foundingUnits: z.array(foundingUnitSchema),
  assets: z.array(assetSchema),
  sources: z.array(sourceSchema),
  wallets: z.array(walletSchema),
  fundingRounds: z.array(fundingRoundSchema),
  recordSources: z.array(recordSourceSchema),
});

export const curatedDataBundleSchema = curatedDataBundleBaseSchema.superRefine(
  (bundle, context) => {
    const collections = [
      ["project", bundle.projects],
      ["founding unit", bundle.foundingUnits],
      ["asset", bundle.assets],
      ["source", bundle.sources],
      ["wallet", bundle.wallets],
      ["funding round", bundle.fundingRounds],
      ["record source", bundle.recordSources],
    ] as const;
    const seenIds = new Map<string, string>();
    for (const [kind, records] of collections) {
      for (const record of records) {
        const prior = seenIds.get(record.id);
        if (prior !== undefined) {
          context.addIssue({
            code: "custom",
            message: `Duplicate UUID ${record.id} in ${prior} and ${kind}`,
          });
        } else {
          seenIds.set(record.id, kind);
        }
      }
    }

    for (const [kind, records] of [
      ["project", bundle.projects],
      ["founding unit", bundle.foundingUnits],
    ] as const) {
      const slugs = new Set<string>();
      for (const record of records) {
        if (slugs.has(record.slug))
          context.addIssue({
            code: "custom",
            message: `Duplicate ${kind} slug ${record.slug}`,
          });
        slugs.add(record.slug);
      }
    }

    const projectIds = new Set(bundle.projects.map(({ id }) => id));
    const foundingUnitIds = new Set(bundle.foundingUnits.map(({ id }) => id));
    const sourceIds = new Set(bundle.sources.map(({ id }) => id));
    const assetsById = new Map(bundle.assets.map((asset) => [asset.id, asset]));
    const recordIdsByType = {
      project: projectIds,
      founding_unit: foundingUnitIds,
      asset: new Set(bundle.assets.map(({ id }) => id)),
      tracked_wallet: new Set(bundle.wallets.map(({ id }) => id)),
      funding_round: new Set(bundle.fundingRounds.map(({ id }) => id)),
    } as const;

    for (const link of bundle.recordSources) {
      if (!sourceIds.has(link.sourceId)) {
        context.addIssue({
          code: "custom",
          message: `Missing source ${link.sourceId} referenced by record source ${link.id}`,
        });
      }
      if (!recordIdsByType[link.recordType].has(link.recordId)) {
        context.addIssue({
          code: "custom",
          message: `Missing ${link.recordType} ${link.recordId} referenced by record source ${link.id}`,
        });
      }
    }
    for (const unit of bundle.foundingUnits) {
      for (const link of unit.projectLinks) {
        if (!projectIds.has(link.projectId))
          context.addIssue({
            code: "custom",
            message: `Missing project ${link.projectId} referenced by founding unit ${unit.id}`,
          });
      }
    }
    for (const asset of bundle.assets) {
      if (!projectIds.has(asset.projectId))
        context.addIssue({
          code: "custom",
          message: `Missing project ${asset.projectId} referenced by asset ${asset.id}`,
        });
    }
    for (const wallet of bundle.wallets) {
      if (!projectIds.has(wallet.projectId))
        context.addIssue({
          code: "custom",
          message: `Missing project ${wallet.projectId} referenced by wallet ${wallet.id}`,
        });
      if (
        wallet.foundingUnitId !== undefined &&
        !foundingUnitIds.has(wallet.foundingUnitId)
      ) {
        context.addIssue({
          code: "custom",
          message: `Missing founding unit ${wallet.foundingUnitId} referenced by wallet ${wallet.id}`,
        });
      }
      for (const assetId of wallet.assetIds) {
        const asset = assetsById.get(assetId);
        if (asset === undefined)
          context.addIssue({
            code: "custom",
            message: `Missing asset ${assetId} referenced by wallet ${wallet.id}`,
          });
        else if (asset.projectId !== wallet.projectId)
          context.addIssue({
            code: "custom",
            message: `Wallet ${wallet.id} references an asset from another project`,
          });
      }
    }
    for (const round of bundle.fundingRounds) {
      if (!projectIds.has(round.projectId))
        context.addIssue({
          code: "custom",
          message: `Missing project ${round.projectId} referenced by funding round ${round.id}`,
        });
    }
    for (const project of bundle.projects) {
      const primaryAssets = bundle.assets.filter(
        (asset) =>
          asset.projectId === project.id && asset.isPrimary && asset.isActive,
      );
      if (project.status === "active" && primaryAssets.length !== 1) {
        context.addIssue({
          code: "custom",
          message: `Active project ${project.id} must have exactly one active primary asset`,
        });
      }
    }

    const attributionByProject = new Map<string, number>();
    for (const unit of bundle.foundingUnits) {
      for (const link of unit.projectLinks) {
        const fraction = Number(link.attributionFraction);
        attributionByProject.set(
          link.projectId,
          (attributionByProject.get(link.projectId) ?? 0) + fraction,
        );
      }
    }
    for (const [projectId, total] of attributionByProject) {
      if (total > 1 + Number.EPSILON)
        context.addIssue({
          code: "custom",
          message: `Attribution fractions exceed one for project ${projectId}`,
        });
    }

    const requiredSourceRecords = [
      ...bundle.projects.map(({ id }) => ["project", id] as const),
      ...bundle.foundingUnits.map(({ id }) => ["founding_unit", id] as const),
      ...bundle.assets.map(({ id }) => ["asset", id] as const),
      ...bundle.wallets.map(({ id }) => ["tracked_wallet", id] as const),
      ...bundle.fundingRounds.map(({ id }) => ["funding_round", id] as const),
    ];
    for (const [recordType, recordId] of requiredSourceRecords) {
      if (
        !bundle.recordSources.some(
          (link) =>
            link.recordType === recordType && link.recordId === recordId,
        )
      ) {
        context.addIssue({
          code: "custom",
          message: `Missing source for ${recordType} ${recordId}`,
        });
      }
    }
  },
);

export type Project = z.infer<typeof projectSchema>;
export type FoundingUnit = z.infer<typeof foundingUnitSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Wallet = z.infer<typeof walletSchema>;
export type FundingRound = z.infer<typeof fundingRoundSchema>;
export type RecordSource = z.infer<typeof recordSourceSchema>;
export type CuratedDataBundle = z.infer<typeof curatedDataBundleSchema>;
