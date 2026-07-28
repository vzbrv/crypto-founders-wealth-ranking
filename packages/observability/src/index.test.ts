import { describe, expect, it, vi } from "vitest";

import { errorMessage, redactContext, reportClientError } from "./index.js";

describe("client error reporting", () => {
  it("redacts sensitive context and bounds messages", () => {
    expect(redactContext({ project: "alpha", apiKey: "private" })).toEqual({
      project: "alpha",
      apiKey: "[redacted]",
    });
    expect(errorMessage(new Error("x".repeat(700)))).toHaveLength(500);
  });

  it("does nothing without an explicitly configured endpoint", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(reportClientError(new Error("test"))).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
