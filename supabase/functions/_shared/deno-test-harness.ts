/**
 * Test-only harness for the `Deno.serve(handler)` edge functions in this
 * directory.
 *
 * Every index.ts here calls `Deno.serve(handler)` once at module load time
 * and reads `Deno.env.get(...)` inside the handler on each request. Neither
 * of those needs an actual Deno runtime to test: `Deno.serve` just needs
 * something to hand the handler to, and `Deno.env.get` just needs to read
 * from a plain object. This stub provides both, so the real handler function
 * can be captured and invoked directly from a Node/vitest test — exercising
 * the exact code that ships, not a reimplementation of it.
 *
 * Usage (must run before importing the module under test):
 *
 *   const denoStub = installDenoStub();
 *   await import("./index.ts");
 *   denoStub.env.SUPABASE_URL = "https://example.supabase.co";
 *   const response = await denoStub.handler(new Request("http://x", { method: "POST" }));
 */

export type DenoRequestHandler = (
  request: Request,
) => Promise<Response> | Response;

export interface DenoStub {
  /** Mutate this directly between tests to change what Deno.env.get(key) returns. */
  env: Record<string, string | undefined>;
  /** Populated once the stubbed module calls Deno.serve(handler). */
  handler: DenoRequestHandler;
}

export function installDenoStub(): DenoStub {
  const stub = {
    env: {} as Record<string, string | undefined>,
  } as DenoStub;

  (globalThis as Record<string, unknown>).Deno = {
    serve: (handler: DenoRequestHandler) => {
      stub.handler = handler;
    },
    env: {
      get: (key: string) => stub.env[key],
    },
  };

  return stub;
}
