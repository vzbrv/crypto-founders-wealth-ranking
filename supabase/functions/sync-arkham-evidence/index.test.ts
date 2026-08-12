import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  installDenoStub,
  type DenoStub,
} from "../_shared/deno-test-harness.js";

let denoStub: DenoStub;

beforeAll(async () => {
  denoStub = installDenoStub();
  await import("./index.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const key of Object.keys(denoStub.env)) delete denoStub.env[key];
});

function setEnvironment(includeArkhamKey: boolean) {
  denoStub.env.SUPABASE_URL = "https://supabase.example";
  denoStub.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-fixture";
  denoStub.env.CRON_SECRET = "correct-secret";
  if (includeArkhamKey) {
    denoStub.env.ARKHAM_API_KEY = "test-only-not-secret";
  }
}

function request() {
  return new Request("https://edge.example/sync-arkham-evidence", {
    method: "POST",
    headers: { "x-cron-secret": "correct-secret" },
  });
}

describe("sync-arkham-evidence", () => {
  it("fails closed when the server-side Arkham key is unavailable", async () => {
    setEnvironment(false);
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ error: "fixture" }), { status: 500 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await denoStub.handler!(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: "Arkham provider unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("api.arkm.com");
  });

  it("does not replace the last accepted balance with zero after an Arkham failure", async () => {
    setEnvironment(true);
    const mapping = {
      id: "mapping-1",
      project_id: "project-ethereum",
      founding_unit_id: "ethereum:vitalik-buterin",
      searched_alias: "Vitalik Buterin",
      entity_id: "entity-1",
      entity_name: "Vitalik Buterin",
      discovery_status: "found",
      chain_code: "ethereum",
      owner_class: "founder",
      attribution_class: "confirmed_entity",
      review_status: "candidate",
      ownership_confidence: "medium",
      score_affecting: false,
      stable_deduplication_key: "ethereum:vitalik-buterin:arkham:entity-1",
    };
    const controlUpdates: unknown[] = [];
    const evidenceBodies: unknown[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://api.arkm.com/")) {
        return new Response(
          JSON.stringify({ message: "unauthorized fixture" }),
          {
            status: 401,
          },
        );
      }
      if (url.includes("/rest/v1/arkham_provider_control")) {
        if (init?.method === "PATCH") {
          controlUpdates.push(JSON.parse(String(init.body)));
          return new Response(null, { status: 204 });
        }
        return new Response(
          JSON.stringify([
            {
              enabled: true,
              monthly_credit_limit: null,
              credits_used: 0,
              last_run_status: "success",
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes("/rest/v1/arkham_entity_mappings")) {
        return new Response(JSON.stringify([mapping]), { status: 200 });
      }
      if (url.includes("/rest/v1/projects")) {
        return new Response(JSON.stringify([{ slug: "ethereum" }]), {
          status: 200,
        });
      }
      if (url.includes("/rest/v1/arkham_evidence")) {
        evidenceBodies.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 201 });
      }
      throw new Error(`Unexpected fixture request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await denoStub.handler!(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({
      ok: false,
      status: "failed",
      mappings: 1,
      failed: 1,
      evidenceCount: 0,
      failureStages: { entity: 1 },
      failureStatuses: { "401": 1 },
    });
    expect(evidenceBodies).toHaveLength(0);
    expect(controlUpdates).toContainEqual(
      expect.objectContaining({ last_run_status: "failed" }),
    );
  });

  it("keeps a successful balance sync when optional predictions are unavailable", async () => {
    setEnvironment(true);
    const mapping = {
      id: "mapping-1",
      project_id: "project-ethereum",
      founding_unit_id: "ethereum:vitalik-buterin",
      searched_alias: "Vitalik Buterin",
      entity_id: "vitalik-buterin",
      entity_name: "Vitalik Buterin",
      discovery_status: "found",
      chain_code: "ethereum",
      owner_class: "founder",
      attribution_class: "confirmed_entity",
      review_status: "candidate",
      ownership_confidence: "medium",
      score_affecting: false,
      stable_deduplication_key:
        "ethereum:vitalik-buterin:arkham:vitalik-buterin",
    };
    const mappingUpdates: Record<string, unknown>[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes("/intelligence/entity_predictions/")) {
        throw new TypeError("fixture network error");
      }
      if (url.startsWith("https://api.arkm.com/")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.includes("/rest/v1/arkham_provider_control")) {
        if (init?.method === "PATCH")
          return new Response(null, { status: 204 });
        return new Response(
          JSON.stringify([
            {
              enabled: true,
              monthly_credit_limit: null,
              credits_used: 0,
              last_run_status: "success",
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes("/rest/v1/arkham_entity_mappings")) {
        if (init?.method === "PATCH") {
          mappingUpdates.push(JSON.parse(String(init.body)));
          return new Response(null, { status: 204 });
        }
        return new Response(JSON.stringify([mapping]), { status: 200 });
      }
      if (url.includes("/rest/v1/projects")) {
        return new Response(JSON.stringify([{ slug: "ethereum" }]), {
          status: 200,
        });
      }
      if (init?.method === "POST") return new Response(null, { status: 201 });
      throw new Error(`Unexpected fixture request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await denoStub.handler!(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "success",
      mappings: 1,
      failed: 0,
      evidenceCount: 0,
    });
    expect(mappingUpdates).toContainEqual(
      expect.objectContaining({
        entity_found: true,
        discovery_status: "found",
        last_success_at: expect.any(String),
      }),
    );
  });

  it("keeps a successful balance sync when optional prediction persistence fails", async () => {
    setEnvironment(true);
    const mapping = {
      id: "mapping-1",
      project_id: "project-ethereum",
      founding_unit_id: "ethereum:vitalik-buterin",
      searched_alias: "Vitalik Buterin",
      entity_id: "vitalik-buterin",
      entity_name: "Vitalik Buterin",
      discovery_status: "found",
      chain_code: "ethereum",
      owner_class: "founder",
      attribution_class: "confirmed_entity",
      review_status: "candidate",
      ownership_confidence: "medium",
      score_affecting: false,
      stable_deduplication_key:
        "ethereum:vitalik-buterin:arkham:vitalik-buterin",
    };
    const mappingUpdates: Record<string, unknown>[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.startsWith("https://api.arkm.com/")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.includes("/rest/v1/arkham_provider_control")) {
        if (init?.method === "PATCH")
          return new Response(null, { status: 204 });
        return new Response(
          JSON.stringify([
            {
              enabled: true,
              monthly_credit_limit: null,
              credits_used: 0,
              last_run_status: "success",
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes("/rest/v1/arkham_entity_mappings")) {
        if (init?.method === "PATCH") {
          mappingUpdates.push(JSON.parse(String(init.body)));
          return new Response(null, { status: 204 });
        }
        return new Response(JSON.stringify([mapping]), { status: 200 });
      }
      if (url.includes("/rest/v1/projects")) {
        return new Response(JSON.stringify([{ slug: "ethereum" }]), {
          status: 200,
        });
      }
      if (url.includes("/rest/v1/arkham_raw_responses")) {
        const body = JSON.parse(String(init?.body));
        if (String(body.endpoint).includes("entity_predictions")) {
          return new Response(JSON.stringify({ error: "fixture" }), {
            status: 500,
          });
        }
        return new Response(null, { status: 201 });
      }
      if (init?.method === "POST") return new Response(null, { status: 201 });
      throw new Error(`Unexpected fixture request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await denoStub.handler!(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "success",
      mappings: 1,
      failed: 0,
      evidenceCount: 0,
    });
    expect(mappingUpdates).toContainEqual(
      expect.objectContaining({
        entity_found: true,
        discovery_status: "found",
        last_success_at: expect.any(String),
      }),
    );
  });

  it("pauses before Arkham requests when the credit threshold is reached", async () => {
    setEnvironment(true);
    const controlUpdates: unknown[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes("/rest/v1/arkham_provider_control")) {
        if (init?.method === "PATCH") {
          controlUpdates.push(JSON.parse(String(init.body)));
          return new Response(null, { status: 204 });
        }
        return new Response(
          JSON.stringify([
            {
              enabled: true,
              monthly_credit_limit: 100,
              credits_used: 95,
              last_run_status: "success",
            },
          ]),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fixture request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await denoStub.handler!(request());
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body).toEqual({ error: "Arkham quota threshold reached" });
    expect(
      fetchMock.mock.calls.every(
        ([input]) => !String(input).includes("api.arkm.com"),
      ),
    ).toBe(true);
    expect(controlUpdates).toContainEqual(
      expect.objectContaining({ last_run_status: "quota_paused" }),
    );
  });

  it("selects the exact Arkham entity from the search response", async () => {
    setEnvironment(true);
    const mapping = {
      id: "mapping-1",
      project_id: "project-ethereum",
      founding_unit_id: "ethereum:vitalik-buterin",
      searched_alias: "  Vitalik   Buterin ",
      entity_id: null,
      entity_name: null,
      discovery_status: "pending",
      chain_code: "ethereum",
      owner_class: "founder",
      attribution_class: "confirmed_entity",
      review_status: "candidate",
      ownership_confidence: "medium",
      score_affecting: false,
      stable_deduplication_key: "ethereum:vitalik-buterin:arkham",
    };
    const mappingUpdates: Record<string, unknown>[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes("/intelligence/search?")) {
        return new Response(
          JSON.stringify({
            arkhamEntities: [
              { id: "wrong-entity", name: "Vitalik Holdings" },
              { id: "vitalik-buterin", name: "Vitalik Buterin" },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.startsWith("https://api.arkm.com/")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.includes("/rest/v1/arkham_provider_control")) {
        if (init?.method === "PATCH")
          return new Response(null, { status: 204 });
        return new Response(
          JSON.stringify([
            {
              enabled: true,
              monthly_credit_limit: null,
              credits_used: 0,
              last_run_status: "success",
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes("/rest/v1/arkham_entity_mappings")) {
        if (init?.method === "PATCH") {
          mappingUpdates.push(JSON.parse(String(init.body)));
          return new Response(null, { status: 204 });
        }
        return new Response(JSON.stringify([mapping]), { status: 200 });
      }
      if (url.includes("/rest/v1/projects")) {
        return new Response(JSON.stringify([{ slug: "ethereum" }]), {
          status: 200,
        });
      }
      if (init?.method === "POST") return new Response(null, { status: 201 });
      throw new Error(`Unexpected fixture request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await denoStub.handler!(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, failed: 0, mappings: 1 });
    expect(mappingUpdates).toContainEqual(
      expect.objectContaining({
        discovery_status: "found",
        entity_id: "vitalik-buterin",
        entity_name: "Vitalik Buterin",
      }),
    );
  });

  it("does not accept an unrelated singleton search result", async () => {
    setEnvironment(true);
    const mapping = {
      id: "mapping-1",
      project_id: "project-cardano",
      founding_unit_id: "cardano:charles-hoskinson",
      searched_alias: "Charles Hoskinson",
      entity_id: null,
      entity_name: null,
      discovery_status: "unrun",
      chain_code: "cardano",
      owner_class: "founder",
      attribution_class: "confirmed_entity",
      review_status: "candidate",
      ownership_confidence: "disputed",
      score_affecting: false,
      stable_deduplication_key: "arkham-audit:cardano:charles-hoskinson",
    };
    const mappingUpdates: Record<string, unknown>[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes("/intelligence/search?")) {
        return new Response(
          JSON.stringify({
            arkhamEntities: [{ id: "charles-token", name: "Charles Token" }],
          }),
          { status: 200 },
        );
      }
      if (url.startsWith("https://api.arkm.com/")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.includes("/rest/v1/arkham_provider_control")) {
        if (init?.method === "PATCH")
          return new Response(null, { status: 204 });
        return new Response(
          JSON.stringify([
            {
              enabled: true,
              monthly_credit_limit: null,
              credits_used: 0,
              last_run_status: "success",
            },
          ]),
          { status: 200 },
        );
      }
      if (url.includes("/rest/v1/arkham_entity_mappings")) {
        if (init?.method === "PATCH") {
          mappingUpdates.push(JSON.parse(String(init.body)));
          return new Response(null, { status: 204 });
        }
        return new Response(JSON.stringify([mapping]), { status: 200 });
      }
      if (url.includes("/rest/v1/projects")) {
        return new Response(JSON.stringify([{ slug: "cardano" }]), {
          status: 200,
        });
      }
      if (init?.method === "POST") return new Response(null, { status: 201 });
      throw new Error(`Unexpected fixture request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await denoStub.handler!(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, failed: 0, mappings: 1 });
    expect(mappingUpdates).toContainEqual(
      expect.objectContaining({
        entity_found: null,
        discovery_status: "ambiguous",
        exclusion_reason: "No exact Arkham entity-name match",
      }),
    );
    expect(mappingUpdates).not.toContainEqual(
      expect.objectContaining({ entity_id: "charles-token" }),
    );
  });
});
