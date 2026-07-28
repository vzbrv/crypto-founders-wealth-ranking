import { describe, expect, it } from "vitest";

import { productStage } from "../../lib/product";

describe("product stage", () => {
  it("identifies the public ranking phase", () => {
    expect(productStage).toBe("Phase 5: public ranking experience");
  });
});
