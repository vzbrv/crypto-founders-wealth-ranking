export type RankChangeSource = "fallback" | "live";
export type RankChangeStatus = "baseline" | "new" | "continued";

export type RankChangeDisplay = {
  text: string;
  label: string;
};

export function formatRankChange(
  value: number | null,
  source: RankChangeSource,
  status: RankChangeStatus = "baseline",
): RankChangeDisplay {
  if (source === "live" && status === "new") {
    return { text: "New", label: "Newly entered the top 20" };
  }
  if (source === "live" && status === "baseline") {
    return {
      text: "—",
      label: "No movement shown for the first baseline snapshot",
    };
  }
  if (value === null) {
    return {
      text: "—",
      label: "No movement shown for the first baseline snapshot",
    };
  }
  if (value === 0) return { text: "—", label: "Position unchanged" };
  const amount = Math.abs(value);
  const unit = amount === 1 ? "position" : "positions";
  return value > 0
    ? { text: `↑ ${amount}`, label: `Moved up ${amount} ${unit}` }
    : { text: `↓ ${amount}`, label: `Moved down ${amount} ${unit}` };
}
