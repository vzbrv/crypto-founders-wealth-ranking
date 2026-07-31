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
export const reviewStatusSchema = z.enum([
  "not_reviewed",
  "in_progress",
  "approved_sufficient",
  "reviewed_insufficient",
]);

const reviewSchema = z
  .strictObject({
    status: reviewStatusSchema,
    reviewer: z.string().min(1).nullable(),
    reviewedAt: dateTimeSchema.nullable(),
    notes: z.string().min(1).nullable(),
    evidenceSourceIds: z.array(uuidSchema),
  })
  .superRefine((review, context) => {
    if (
      ["approved_sufficient", "reviewed_insufficient"].includes(
        review.status,
      ) &&
      (review.reviewer === null ||
        review.reviewedAt === null ||
        review.notes === null ||
        review.evidenceSourceIds.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A completed review requires reviewer, timestamp, notes, and evidence",
        path: ["status"],
      });
    }
  });

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
  walletReview: reviewSchema,
  fundingReview: reviewSchema,
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
        isCanonical: z.boolean(),
        allocationMethodology: z.string().min(1).nullable(),
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
    balanceIncludedInCirculatingSupply: z.boolean().nullable(),
    circulatingInclusionExplanation: z.string().min(1).nullable(),
    affectsScore: z.boolean(),
    deduplicationKey: z.string().min(1),
    reviewStatus: reviewStatusSchema,
    reviewer: z.string().min(1).nullable(),
    reviewedAt: dateTimeSchema.nullable(),
    evidenceSourceIds: z.array(uuidSchema),
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
    if (
      wallet.affectsScore &&
      wallet.balanceIncludedInCirculatingSupply === null
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A score-affecting wallet requires circulation inclusion evidence",
        path: ["balanceIncludedInCirculatingSupply"],
      });
    }
    if (
      (wallet.circulatingInclusionFraction !== null ||
        wallet.balanceIncludedInCirculatingSupply !== null) &&
      wallet.circulatingInclusionExplanation === null
    ) {
      context.addIssue({
        code: "custom",
        message: "A circulation determination requires an explanation",
        path: ["circulatingInclusionExplanation"],
      });
    }
    if (
      wallet.reviewStatus === "approved_sufficient" &&
      (wallet.reviewer === null ||
        wallet.reviewedAt === null ||
        wallet.evidenceSourceIds.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "An approved wallet requires reviewer, timestamp, and evidence",
        path: ["reviewStatus"],
      });
    }
    if (
      wallet.circulatingInclusionFraction === "0" &&
      (wallet.reviewStatus !== "approved_sufficient" ||
        wallet.reviewer === null ||
        wallet.reviewedAt === null ||
        wallet.notes === undefined ||
        wallet.evidenceSourceIds.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A reviewed zero wallet deduction requires reviewer, timestamp, notes, and evidence",
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
      "equity",
      "venture",
      "private",
      "private_token_sale",
      "strategic",
      "accelerator",
      "public",
      "public_token_sale",
      "crowdsale",
      "grant",
      "debt",
      "other",
    ]),
    originalAmount: decimalSchema.optional(),
    originalCurrency: z.string().min(1).optional(),
    amountUsdAtEvent: decimalSchema.optional(),
    amountStatus: z.enum(["exact", "approximate", "unknown"]),
    conversionMethod: z.string().min(1).optional(),
    usdConversionDate: dateSchema.optional(),
    includeInCapitalDeduction: z.boolean(),
    inclusionReason: z.string().min(1),
    deduplicationKey: z.string().min(1),
    reviewStatus: reviewStatusSchema,
    reviewer: z.string().min(1).nullable(),
    evidenceSourceIds: z.array(uuidSchema),
    status: statusSchema,
    reviewedAt: dateTimeSchema,
    notes: z.string().min(1).optional(),
  })
  .superRefine((round, context) => {
    if (
      (round.originalAmount === undefined) !==
      (round.originalCurrency === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Original amount and currency must be supplied together",
        path: ["originalAmount"],
      });
    }
    if (
      (round.amountStatus === "unknown") !==
      (round.amountUsdAtEvent === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Unknown amount status must preserve a missing USD amount",
        path: ["amountStatus"],
      });
    }
    if (
      round.amountUsdAtEvent !== undefined &&
      (round.conversionMethod === undefined ||
        round.usdConversionDate === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "A USD amount requires its conversion method and date",
        path: ["conversionMethod"],
      });
    }
    if (
      round.reviewStatus === "approved_sufficient" &&
      (round.reviewer === null || round.evidenceSourceIds.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "An approved funding event requires reviewer and evidence",
        path: ["reviewStatus"],
      });
    }
    if (
      round.amountUsdAtEvent === "0" &&
      (round.reviewStatus !== "approved_sufficient" ||
        round.reviewer === null ||
        round.notes === undefined ||
        round.evidenceSourceIds.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A reviewed zero funding amount requires reviewer, timestamp, notes, and evidence",
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
    for (const project of bundle.projects) {
      for (const [reviewName, review] of [
        ["walletReview", project.walletReview],
        ["fundingReview", project.fundingReview],
      ] as const) {
        for (const sourceId of review.evidenceSourceIds) {
          if (!sourceIds.has(sourceId))
            context.addIssue({
              code: "custom",
              message: `Missing source ${sourceId} referenced by project ${project.id} ${reviewName}`,
            });
        }
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
      for (const sourceId of wallet.evidenceSourceIds) {
        if (!sourceIds.has(sourceId))
          context.addIssue({
            code: "custom",
            message: `Missing source ${sourceId} referenced by wallet ${wallet.id}`,
          });
      }
    }
    for (const round of bundle.fundingRounds) {
      if (!projectIds.has(round.projectId))
        context.addIssue({
          code: "custom",
          message: `Missing project ${round.projectId} referenced by funding round ${round.id}`,
        });
      for (const sourceId of round.evidenceSourceIds) {
        if (!sourceIds.has(sourceId))
          context.addIssue({
            code: "custom",
            message: `Missing source ${sourceId} referenced by funding round ${round.id}`,
          });
      }
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

    for (const project of bundle.projects.filter(
      ({ status }) => status === "active",
    )) {
      const activeLinks = bundle.foundingUnits
        .filter(({ status }) => status === "active")
        .flatMap((unit) =>
          unit.projectLinks
            .filter(({ projectId }) => projectId === project.id)
            .map((link) => ({ unit, link })),
        );
      const documentedAllocation =
        activeLinks.length > 1 &&
        activeLinks.every(({ link }) => !link.isCanonical) &&
        activeLinks.every(
          ({ link }) => link.attributionMethod === "documented_split",
        ) &&
        activeLinks.every(
          ({ link }) => link.allocationMethodology !== null,
        ) &&
        new Set(
          activeLinks.map(({ link }) => link.allocationMethodology),
        ).size === 1 &&
        Math.abs(
          activeLinks.reduce(
            (total, { link }) => total + Number(link.attributionFraction),
            0,
          ) - 1,
        ) <= Number.EPSILON;
      const canonicalAllocation =
        activeLinks.length === 1 &&
        activeLinks[0]?.link.isCanonical === true &&
        Number(activeLinks[0].link.attributionFraction) === 1;
      if (!canonicalAllocation && !documentedAllocation)
        context.addIssue({
          code: "custom",
          message: `Active project ${project.id} must have one canonical founding unit or an explicit documented allocation`,
        });
    }

    for (const [kind, records] of [
      ["wallet", bundle.wallets],
      ["funding round", bundle.fundingRounds],
    ] as const) {
      const deduplicationKeys = new Set<string>();
      for (const record of records) {
        const key = `${record.projectId}:${record.deduplicationKey}`;
        if (deduplicationKeys.has(key))
          context.addIssue({
            code: "custom",
            message: `Duplicate ${kind} deduplication key ${key}`,
          });
        deduplicationKeys.add(key);
      }
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

    const requiredSourceClaims = [
      ...bundle.projects.flatMap(
        ({ id }) =>
          [
            ["project", id, "identity"],
            ["project", id, "methodologyNotes"],
          ] as const,
      ),
      ...bundle.foundingUnits.flatMap(
        (unit) =>
          [
            ["founding_unit", unit.id, "identity"],
            ...unit.projectLinks.flatMap(
              (_, index) =>
                [
                  [
                    "founding_unit",
                    unit.id,
                    `projectLinks[${index}].attributionFraction`,
                  ],
                  [
                    "founding_unit",
                    unit.id,
                    `projectLinks[${index}].attributionMethod`,
                  ],
                ] as const,
            ),
          ] as const,
      ),
      ...bundle.assets.flatMap(
        (asset) =>
          [
            ["asset", asset.id, "identity"],
            ["asset", asset.id, "providerIds"],
            ["asset", asset.id, "chainCode"],
            ...(asset.contractAddress
              ? [["asset", asset.id, "contractAddress"] as const]
              : []),
          ] as const,
      ),
      ...bundle.wallets.flatMap(
        ({ id }) =>
          [
            ["tracked_wallet", id, "ownership"],
            ["tracked_wallet", id, "classification"],
            ["tracked_wallet", id, "ownershipConfidence"],
            ["tracked_wallet", id, "circulatingInclusionFraction"],
            ["tracked_wallet", id, "affectsScore"],
          ] as const,
      ),
      ...bundle.fundingRounds.flatMap(
        (round) =>
          [
            ["funding_round", round.id, "eventDate"],
            ["funding_round", round.id, "roundType"],
            ...(round.originalAmount !== undefined
              ? [["funding_round", round.id, "originalAmount"] as const]
              : []),
            ["funding_round", round.id, "amountUsdAtEvent"],
            ...(round.conversionMethod
              ? [["funding_round", round.id, "conversionMethod"] as const]
              : []),
            ["funding_round", round.id, "includeInCapitalDeduction"],
          ] as const,
      ),
    ] as const;
    for (const [recordType, recordId, field] of requiredSourceClaims) {
      if (
        !bundle.recordSources.some(
          (link) =>
            link.recordType === recordType &&
            link.recordId === recordId &&
            link.field === field,
        )
      ) {
        context.addIssue({
          code: "custom",
          message: `Missing source for ${recordType} ${recordId} field ${field}`,
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
