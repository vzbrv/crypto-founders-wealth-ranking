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

  it("formats canonical movement for live hourly snapshots", () => {
    expect(formatRankChange(2, "live")).toEqual({
      text: "↑ 2",
      label: "Moved up 2 positions",
    });
  });

  it("explains when a live snapshot has no prior rank", () => {
    expect(formatRankChange(null, "live")).toEqual({
      text: "—",
      label: "No prior published rank is available for this snapshot",
    });
  });

  it("treats undefined movement as unavailable", () => {
    expect(formatRankChange(undefined, "fallback")).toEqual({
      text: "—",
      label: "No movement shown for the first baseline snapshot",
    });
  });
});
