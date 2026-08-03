import { describe, expect, it } from "vitest";

import { formatRankChange } from "../../lib/rank-change";

describe("rank change display", () => {
  it("formats published fallback movement with accessible labels", () => {
    expect(formatRankChange(2, "fallback")).toEqual({
      text: "↑ 2",
      label: "Moved up 2 positions",
    });
    expect(formatRankChange(-1, "fallback")).toEqual({
      text: "↓ 1",
      label: "Moved down 1 position",
    });
    expect(formatRankChange(0, "fallback")).toEqual({
      text: "—",
      label: "Position unchanged",
    });
  });

  it("labels the first baseline without inventing movement", () => {
    expect(formatRankChange(null, "fallback")).toEqual({
      text: "—",
      label: "No movement shown for the first baseline snapshot",
    });
  });

  it("formats movement from the previous complete live snapshot", () => {
    expect(formatRankChange(2, "live", "continued")).toEqual({
      text: "↑ 2",
      label: "Moved up 2 positions",
    });
    expect(formatRankChange(null, "live", "baseline")).toEqual({
      text: "—",
      label: "No movement shown for the first baseline snapshot",
    });
    expect(formatRankChange(null, "live", "new")).toEqual({
      text: "New",
      label: "Newly entered the top 20",
    });
  });
});
