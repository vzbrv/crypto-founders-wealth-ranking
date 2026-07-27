import { describe, expect, it } from "vitest";

import { productStage } from "../../lib/product";

describe("product stage", () => {
  it("identifies the repository as a foundation-only build", () => {
    expect(productStage).toBe("Phase 0: repository foundation");
  });
});
