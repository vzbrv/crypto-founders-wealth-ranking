import { timingSafeEqual } from "../_shared/timing-safe-equal.ts";
import {
  ArkhamApiError,
  ArkhamClient,
  type ArkhamResponse,
} from "../_shared/arkham.ts";

type JsonRecord = Record<string, unknown>;

interface MappingRow {
  id: string;
  project_id: string;
  founding_unit_id: string | null;
  searched_alias: string;
  entity_id: string | null;
  entity_name: string | null;
  discovery_status: string;
  chain_code: string | null;
  owner_class: string;
  attribution_class: string;
  review_status: string;
  ownership_confidence: string;
  score_affecting: boolean;
  stable_deduplication_key: string;
}

interface ControlRow {
  enabled: boolean;
  monthly_credit_limit: number | null;
  credits_used: number;
  last_run_status: string;
}

const functionName = "sync-arkham-evidence";
const jsonHeaders = { "content-type": "application/json" };
const projectTokens: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  bnb: "BNB",
  xrp: "XRP",
  solana: "SOL",
  tron: "TRX",
  hyperliquid: "HYPE",
  dogecoin: "DOGE",
  chainlink: "LINK",
  cardano: "ADA",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function log(
  level: "info" | "warn" | "error",
  event: string,
  details: Record<string, unknown> = {},
): void {
  console[level](
    JSON.stringify({ level, function: functionName, event, ...details }),
  );
}

function records(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value.filter(isRecord);
  if (!isRecord(value)) return [];
  for (const key of [
    "data",
    "results",
    "entities",
    "arkhamEntities",
    "balances",
    "tokens",
    "addresses",
    "predictions",
  ]) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested.filter(isRecord);
  }
  return [value];
}

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function firstString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function addressCandidates(value: unknown): string[] {
  return [
    ...new Set(
      records(value)
        .map((record) =>
          firstString(record, [
            "address",
            "walletAddress",
            "wallet_address",
            "account",
          ]),
        )
        .filter((address): address is string => Boolean(address)),
    ),
  ];
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function timestamp(record: JsonRecord): string | null {
  return firstString(record, [
    "quoteTime",
    "quote_time",
    "timestamp",
    "observedAt",
    "observed_at",
    "updatedAt",
  ]);
}

function tokenSymbol(record: JsonRecord): string | null {
  const nested = isRecord(record.token)
    ? record.token
    : isRecord(record.asset)
      ? record.asset
      : null;
  return (
    (
      firstString(record, [
        "symbol",
        "tokenSymbol",
        "token_symbol",
        "assetSymbol",
      ]) ??
      (nested ? firstString(nested, ["symbol", "tokenSymbol", "name"]) : null)
    )?.toUpperCase() ?? null
  );
}

function entityId(record: JsonRecord): string | null {
  return firstString(record, ["id", "entityId", "entity_id", "entity"]);
}

function entityName(record: JsonRecord): string | null {
  return firstString(record, ["name", "entityName", "entity_name", "label"]);
}

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

function selectEntityCandidate(
  candidates: JsonRecord[],
  searchedAlias: string,
): JsonRecord | null {
  const exactMatches = candidates.filter((candidate) => {
    const name = entityName(candidate);
    return name && normalizedName(name) === normalizedName(searchedAlias);
  });
  return exactMatches.length === 1 ? exactMatches[0] : null;
}

function sourceIds(response: ArkhamResponse<unknown>): string[] {
  return [`arkham:${response.rawResponseHash}`];
}

async function rest<T>(
  url: URL,
  headers: Record<string, string>,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init.headers ?? {}) },
  });
  if (!response.ok)
    throw new Error(`Supabase REST request failed: ${response.status}`);
  return (await response.json()) as T;
}

async function patch<T>(
  supabaseUrl: string,
  headers: Record<string, string>,
  path: string,
  body: T,
  query = "",
): Promise<void> {
  const url = new URL(`/rest/v1/${path}${query}`, supabaseUrl);
  const response = await fetch(url, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Supabase REST update failed: ${response.status}`);
}

async function insert(
  supabaseUrl: string,
  headers: Record<string, string>,
  path: string,
  body: unknown,
): Promise<void> {
  const url = new URL(`/rest/v1/${path}`, supabaseUrl);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`Supabase REST insert failed: ${response.status}`);
}

async function saveRaw(
  supabaseUrl: string,
  headers: Record<string, string>,
  response: ArkhamResponse<unknown>,
  alias: string,
): Promise<void> {
  await insert(supabaseUrl, headers, "arkham_raw_responses", {
    raw_response_hash: response.rawResponseHash,
    endpoint: response.endpoint,
    queried_alias: alias,
    observed_at: response.observedAt,
    payload: response.data,
  });
}

async function markControl(
  supabaseUrl: string,
  headers: Record<string, string>,
  status: string,
  reason: string | null,
  successAt?: string,
): Promise<void> {
  const body: Record<string, unknown> = {
    last_run_status: status,
    last_run_completed_at: new Date().toISOString(),
    paused_reason: reason,
    updated_at: new Date().toISOString(),
  };
  if (successAt !== undefined) body.last_success_at = successAt;
  await patch(
    supabaseUrl,
    headers,
    "arkham_provider_control",
    body,
    "?id=eq.true",
  );
}

function usageNumber(value: unknown, names: string[]): number | null {
  if (!value || typeof value !== "object") return null;
  for (const name of names) {
    const candidate = (value as Record<string, unknown>)[name];
    if (typeof candidate === "number" && Number.isFinite(candidate))
      return candidate;
    if (typeof candidate === "string" && Number.isFinite(Number(candidate)))
      return Number(candidate);
  }
  return null;
}

async function recordUsage(
  supabaseUrl: string,
  headers: Record<string, string>,
  response: ArkhamResponse<unknown>,
): Promise<void> {
  const data = response.data;
  const credits =
    usageNumber(data, ["creditsUsed", "credits_used", "used", "usage"]) ??
    (data && typeof data === "object"
      ? usageNumber((data as Record<string, unknown>).data, [
          "creditsUsed",
          "credits_used",
          "used",
        ])
      : null) ??
    0;
  await insert(supabaseUrl, headers, "arkham_usage_events", {
    observed_at: response.observedAt,
    endpoint: response.endpoint,
    response_status: response.status,
    estimated_credits: credits,
    raw_response_hash: response.rawResponseHash,
  });
  if (credits > 0) {
    await patch(
      supabaseUrl,
      headers,
      "arkham_provider_control",
      {
        credits_used: credits,
        updated_at: new Date().toISOString(),
      },
      "?id=eq.true",
    );
  }
}

async function ingestEvidence(
  supabaseUrl: string,
  headers: Record<string, string>,
  mapping: MappingRow,
  projectToken: string,
  response: ArkhamResponse<unknown>,
  attributionClass: "confirmed_entity" | "predicted",
  recordsToInsert: JsonRecord[],
): Promise<number> {
  let inserted = 0;
  for (const balance of recordsToInsert) {
    const symbol = tokenSymbol(balance);
    const quantity = numberOrNull(
      balance.quantity ??
        balance.balance ??
        balance.tokenQuantity ??
        balance.token_quantity,
    );
    const usdValue = numberOrNull(
      balance.usdValue ??
        balance.usd_value ??
        balance.valueUsd ??
        balance.value_usd,
    );
    const isRelevant = symbol === projectToken;
    if (!isRelevant) continue;
    const chain =
      firstString(balance, ["chain", "chainCode", "chain_code"]) ??
      mapping.chain_code;
    const address = firstString(balance, [
      "address",
      "walletAddress",
      "wallet_address",
    ]);
    const stableKey = `${mapping.stable_deduplication_key}:${attributionClass}:${symbol ?? "unknown"}:${address ?? "entity"}`;
    await insert(supabaseUrl, headers, "arkham_evidence", {
      mapping_id: mapping.id,
      project_id: mapping.project_id,
      founding_unit_id: mapping.founding_unit_id,
      entity_id: mapping.entity_id,
      entity_name: mapping.entity_name,
      searched_alias: mapping.searched_alias,
      chain_code: chain,
      address,
      owner_class: mapping.owner_class,
      attribution_class: attributionClass,
      expected_project_token_symbol: projectToken,
      token_symbol: symbol,
      token_quantity: quantity,
      arkham_usd_value: usdValue,
      arkham_quote_time: timestamp(balance) ?? response.observedAt,
      source_endpoint: response.endpoint,
      source_evidence_ids: sourceIds(response),
      review_status: "candidate",
      ownership_confidence: mapping.ownership_confidence,
      score_affecting: false,
      exclusion_reason:
        attributionClass === "predicted"
          ? "Predicted address excluded from score"
          : mapping.owner_class === "custodial" ||
              mapping.owner_class === "exchange_customer_assets"
            ? "Custodial or customer assets excluded from score"
            : !isRelevant
              ? "Unrelated portfolio token excluded from score"
              : "Reviewer approval required",
      stable_deduplication_key: stableKey,
      raw_response_hash: response.rawResponseHash,
    });
    inserted += 1;
  }
  return inserted;
}

Deno.serve(async (request) => {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");
  const apiKey = Deno.env.get("ARKHAM_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !cronSecret) {
    log("error", "configuration_error");
    return json({ error: "Server configuration error" }, 500);
  }
  if (
    !timingSafeEqual(request.headers.get("x-cron-secret") ?? "", cronSecret)
  ) {
    log("error", "unauthorized");
    return json({ error: "Unauthorized" }, 401);
  }
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
  if (!apiKey) {
    await markControl(
      supabaseUrl,
      headers,
      "failed",
      "Arkham API key is not configured",
    ).catch(() => undefined);
    log("error", "arkham_key_missing");
    return json({ error: "Arkham provider unavailable" }, 503);
  }

  try {
    const controls = await rest<ControlRow[]>(
      new URL(
        "/rest/v1/arkham_provider_control?select=enabled,monthly_credit_limit,credits_used,last_run_status&id=eq.true",
        supabaseUrl,
      ),
      headers,
    );
    const control = controls[0];
    if (!control) throw new Error("ARKHAM_CONTROL_MISSING");
    if (!control.enabled) return json({ ok: true, disabled: true });
    if (
      control.monthly_credit_limit !== null &&
      control.credits_used >= control.monthly_credit_limit * 0.9
    ) {
      await markControl(
        supabaseUrl,
        headers,
        "quota_paused",
        "Arkham quota threshold reached",
      );
      return json({ error: "Arkham quota threshold reached" }, 429);
    }
    await markControl(supabaseUrl, headers, "running", null);
    const client = new ArkhamClient({ apiKey });

    for (const loadUsage of [
      () => client.getUsage(),
      () => client.getCredits(),
    ]) {
      try {
        const usage = await loadUsage();
        await saveRaw(supabaseUrl, headers, usage, "__quota__");
        await recordUsage(supabaseUrl, headers, usage);
      } catch (error) {
        const status = error instanceof ArkhamApiError ? error.status : null;
        log("warn", "quota_endpoint_unavailable", { status });
      }
    }

    for (const loadReference of [
      () => client.getChains(),
      () => client.getEntityUpdates(),
      () => client.getAddressUpdates(),
    ]) {
      try {
        const reference = await loadReference();
        await saveRaw(supabaseUrl, headers, reference, "__reference__");
      } catch (error) {
        const status = error instanceof ArkhamApiError ? error.status : null;
        log("warn", "reference_endpoint_unavailable", { status });
      }
    }

    const mappings = await rest<MappingRow[]>(
      new URL(
        "/rest/v1/arkham_entity_mappings?select=*&order=searched_alias.asc",
        supabaseUrl,
      ),
      headers,
    );
    let failed = 0;
    let evidenceCount = 0;
    const failureStages: Record<string, number> = {};
    const failureStatuses: Record<string, number> = {};
    for (const original of mappings) {
      const projectSlug = (
        await rest<{ slug: string }[]>(
          new URL(
            `/rest/v1/projects?select=slug&id=eq.${original.project_id}`,
            supabaseUrl,
          ),
          headers,
        )
      )[0]?.slug;
      const projectToken = projectSlug ? projectTokens[projectSlug] : undefined;
      if (!projectToken) continue;
      let mapping = original;
      let stage = "search";
      try {
        if (!mapping.entity_id) {
          const search = await client.search(mapping.searched_alias);
          await saveRaw(supabaseUrl, headers, search, mapping.searched_alias);
          const candidates = records(search.data).filter((candidate) =>
            entityId(candidate),
          );
          const candidate = selectEntityCandidate(
            candidates,
            mapping.searched_alias,
          );
          if (!candidate) {
            await patch(
              supabaseUrl,
              headers,
              "arkham_entity_mappings",
              {
                entity_found: candidates.length > 0 ? null : false,
                discovery_status:
                  candidates.length > 0 ? "ambiguous" : "not_found",
                review_status: "candidate",
                score_affecting: false,
                exclusion_reason:
                  candidates.length > 0
                    ? "No exact Arkham entity-name match"
                    : "Arkham entity not found",
                observed_at: search.observedAt,
                raw_response_hash: search.rawResponseHash,
                updated_at: new Date().toISOString(),
              },
              `?id=eq.${mapping.id}`,
            );
            continue;
          }
          const foundId = entityId(candidate)!;
          await patch(
            supabaseUrl,
            headers,
            "arkham_entity_mappings",
            {
              entity_found: true,
              discovery_status: "found",
              entity_id: foundId,
              entity_name: entityName(candidate) ?? mapping.searched_alias,
              observed_at: search.observedAt,
              raw_response_hash: search.rawResponseHash,
              last_success_at: search.observedAt,
              updated_at: new Date().toISOString(),
            },
            `?id=eq.${mapping.id}`,
          );
          mapping = {
            ...mapping,
            entity_id: foundId,
            entity_name: entityName(candidate) ?? mapping.searched_alias,
          };
        }
        stage = "entity";
        const entity = await client.getEntity(mapping.entity_id!);
        await saveRaw(supabaseUrl, headers, entity, mapping.searched_alias);
        stage = "balances";
        const balances = await client.getEntityBalances(mapping.entity_id!);
        await saveRaw(supabaseUrl, headers, balances, mapping.searched_alias);
        evidenceCount += await ingestEvidence(
          supabaseUrl,
          headers,
          mapping,
          projectToken,
          balances,
          "confirmed_entity",
          records(balances.data),
        );

        if (projectSlug === "hyperliquid") {
          const hyperCoreEntityEndpoint = Deno.env.get(
            "ARKHAM_HYPERCORE_ENTITY_ENDPOINT",
          );
          const hyperCoreAccountEndpoint = Deno.env.get(
            "ARKHAM_HYPERCORE_ACCOUNT_ENDPOINT",
          );
          if (hyperCoreEntityEndpoint) {
            const hyperCoreEntity = await client.getHyperCoreEntity(
              mapping.entity_id!,
              hyperCoreEntityEndpoint,
            );
            if (hyperCoreEntity)
              await saveRaw(
                supabaseUrl,
                headers,
                hyperCoreEntity,
                mapping.searched_alias,
              );
          }
          if (hyperCoreAccountEndpoint) {
            for (const account of addressCandidates(balances.data).slice(
              0,
              25,
            )) {
              const hyperCoreAccount = await client.getHyperCoreAccount(
                account,
                hyperCoreAccountEndpoint,
              );
              if (hyperCoreAccount)
                await saveRaw(supabaseUrl, headers, hyperCoreAccount, account);
            }
          }
        }

        stage = "predictions";
        let predictions = null;
        try {
          predictions = await client.getEntityPredictions(mapping.entity_id!);
        } catch (error) {
          const status = error instanceof ArkhamApiError ? error.status : null;
          log("warn", "predictions_unavailable", {
            mappingId: mapping.id,
            status,
          });
        }
        if (predictions) {
          await saveRaw(
            supabaseUrl,
            headers,
            predictions,
            mapping.searched_alias,
          );
          evidenceCount += await ingestEvidence(
            supabaseUrl,
            headers,
            mapping,
            projectToken,
            predictions,
            "predicted",
            records(predictions.data),
          );
        }
        stage = "persistence";
        await patch(
          supabaseUrl,
          headers,
          "arkham_entity_mappings",
          {
            entity_found: true,
            discovery_status: "found",
            observed_at: balances.observedAt,
            last_success_at: balances.observedAt,
            raw_response_hash: balances.rawResponseHash,
            updated_at: new Date().toISOString(),
          },
          `?id=eq.${mapping.id}`,
        );
      } catch (error) {
        failed += 1;
        const status = error instanceof ArkhamApiError ? error.status : null;
        const statusKey = status === null ? "unknown" : String(status);
        failureStages[stage] = (failureStages[stage] ?? 0) + 1;
        failureStatuses[statusKey] = (failureStatuses[statusKey] ?? 0) + 1;
        log("error", "mapping_failed", {
          mappingId: mapping.id,
          stage,
          status,
        });
      }
    }
    const completedAt = new Date().toISOString();
    const runStatus =
      failed === 0
        ? "success"
        : failed < mappings.length
          ? "partial"
          : "failed";
    await markControl(
      supabaseUrl,
      headers,
      runStatus,
      failed === 0 ? null : "One or more Arkham mappings failed",
      failed === 0 ? completedAt : undefined,
    );
    log("info", "run_completed", {
      mappings: mappings.length,
      failed,
      evidenceCount,
      failureStages,
      failureStatuses,
    });
    return json(
      {
        ok: failed === 0,
        status: runStatus,
        mappings: mappings.length,
        failed,
        evidenceCount,
        failureStages,
        failureStatuses,
      },
      failed === 0 ? 200 : 502,
    );
  } catch (error) {
    await markControl(
      supabaseUrl,
      headers,
      "failed",
      "Arkham ingestion failed",
    ).catch(() => undefined);
    log("error", "run_failed", {
      code: error instanceof Error ? error.message : "unknown",
    });
    return json({ error: "Arkham ingestion failed" }, 502);
  }
});
