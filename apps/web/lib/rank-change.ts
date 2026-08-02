export type RankChangeSource = "fallback" | "live";

export type RankChangeDisplay = {
  text: string;
  label: string;
};

export function formatRankChange(
  value: number | null | undefined,
  source: RankChangeSource,
): RankChangeDisplay {
  const normalizedValue = value ?? null;

  if (normalizedValue === null) {
    return {
      text: "—",
      label:
        source === "live"
          ? "No prior published rank is available for this snapshot"
          : "No movement shown for the first baseline snapshot",
    };
  }
  if (normalizedValue === 0) return { text: "—", label: "Position unchanged" };
  const amount = Math.abs(normalizedValue);
  const unit = amount === 1 ? "position" : "positions";
  return normalizedValue > 0
    ? { text: `↑ ${amount}`, label: `Moved up ${amount} ${unit}` }
    : { text: `↓ ${amount}`, label: `Moved down ${amount} ${unit}` };
}
