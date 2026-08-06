import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  installDenoStub,
  type DenoStub,
} from "../_shared/deno-test-harness.js";

// Regression test for a real production incident: the unified_ranking_documents
// .dataset column landed as a JSON *string* (double-encoded) instead of a JSON
// object. readUnifiedDocument used to fail with a cryptic
// "Cannot read properties of undefined (reading 'length')" in that case,
// because `document.entries` on a string is undefined. It now throws a
// specific, diagnosable error instead. See sync-curated-data.ts for the
// write-side guard that should prevent this from reaching production again.

let denoStub: DenoStub;
let readUnifiedDocument: typeof import("./index.js").readUnifiedDocument;

beforeAll(async () => {
  denoStub = installDenoStub();
  ({ readUnifiedDocument } = await import("./index.js"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubUnifiedDocumentsResponse(dataset: unknown) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([{ dataset }]), { status: 200 }),
      ),
  );
}

describe("readUnifiedDocument", () => {
  it("throws a specific error when dataset is a JSON string instead of an object", async () => {
    // This is exactly the corrupted shape observed in production: the
    // object was JSON-encoded twice, so PostgREST returns it as a string.
    const doubleEncoded = JSON.stringify({ entries: new Array(20).fill({}) });

    stubUnifiedDocumentsResponse(doubleEncoded);

    await expect(
      readUnifiedDocument("https://example.supabase.co", {
        "content-type": "application/json",
      }),
    ).rejects.toThrow(/not a JSON object \(got string\)/);
  });

  it("throws a specific error when dataset is missing entirely", async () => {
    stubUnifiedDocumentsResponse(undefined);

    await expect(
      readUnifiedDocument("https://example.supabase.co", {
        "content-type": "application/json",
      }),
    ).rejects.toThrow(/not a JSON object \(got undefined\)/);
  });

  it("throws the top-20 error when dataset is a valid object with the wrong entry count", async () => {
    stubUnifiedDocumentsResponse({ entries: new Array(19).fill({}) });

    await expect(
      readUnifiedDocument("https://example.supabase.co", {
        "content-type": "application/json",
      }),
    ).rejects.toThrow("unified ranking document is not a complete top 20");
  });

  it("returns the document when dataset is a valid, complete object", async () => {
    const valid = { entries: new Array(20).fill({}) };
    stubUnifiedDocumentsResponse(valid);

    await expect(
      readUnifiedDocument("https://example.supabase.co", {
        "content-type": "application/json",
      }),
    ).resolves.toEqual(valid);
  });
});
