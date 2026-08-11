import { describe, expect, it } from "vitest";

import { formatValueChange } from "../../lib/value-change";

describe("formatValueChange", () => {
  it("formats live increases", () => {
    expect(formatValueChange("100000000", "live")).toEqual({
      text: "+$100M",
      label: "Value increased by $100M since previous snapshot",
    });
  });

  it("formats live decreases", () => {
    expect(formatValueChange("-10000000", "live")).toEqual({
      text: "−$10M",
      label: "Value decreased by $10M since previous snapshot",
    });
  });

  it("retains significant compact-value decimals", () => {
    expect(formatValueChange("12340000", "live")).toEqual({
      text: "+$12.34M",
      label: "Value increased by $12.34M since previous snapshot",
    });
  });

  it("marks unchanged live values", () => {
    expect(formatValueChange("0", "live")).toEqual({
      text: "—",
      label: "Value unchanged since previous snapshot",
    });
  });

  it.each([
    [null, "live"],
    ["100", "v2"],
    ["100", "fallback"],
    ["invalid", "live"],
  ] as const)("marks unavailable values", (value, source) => {
    expect(formatValueChange(value, source)).toEqual({
      text: "—",
      label: "Previous snapshot value is unavailable",
    });
  });
});
