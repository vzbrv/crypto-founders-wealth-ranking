"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  calculateEntryLiveEstimate,
  type LiveEstimate,
} from "../lib/live-prices";
import {
  buildRankingEntries,
  filterEntries,
  freshnessLabel,
  type RankingEntry,
  type RawLeaderboardRow,
  type RawProjectDetail,
} from "../lib/ranking";
import { useLivePrices } from "../lib/use-live-prices";
import { SiteNav } from "./site-nav";

const DISCLAIMER =
  "Estimated outside-holder token value is not personal wealth. Scores are estimates based on public market data and reviewed public evidence about project-affiliated holdings and disclosed outside capital. Wallet attribution and circulating-supply classifications may be incomplete or disputed.";

function money(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function canonicalTime(entries: RankingEntry[]): string {
  if (!entries.length) return "Waiting for first published calculation";
  const newest = entries
    .map(({ calculatedAt }) => calculatedAt)
    .sort()
    .at(-1);
  return newest
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(newest))
    : "Unavailable";
}

function movement(value: number | null): { label: string; className: string } {
  if (!value) return { label: "—", className: "movement neutral" };
  return value > 0
    ? { label: `↑ ${value}`, className: "movement positive" }
    : { label: `↓ ${Math.abs(value)}`, className: "movement negative" };
}

function ProjectNames({ entry }: { entry: RankingEntry }) {
  return entry.projects.length ? (
    <span>
      {entry.projects.map(({ name, slug }, index) => (
        <span key={slug}>
          {index > 0 ? ", " : ""}
          <a href={`/project/${slug}/#calculation`}>{name}</a>{" "}
          <a href={`/project/${slug}/#evidence`}>Calculation &amp; sources</a>
        </span>
      ))}
    </span>
  ) : (
    <span className="muted">Pending mapping</span>
  );
}

function ConfidenceBadge({ value }: { value: RankingEntry["confidence"] }) {
  return <span className={`badge confidence ${value}`}>{value}</span>;
}

function FreshnessBadge({
  date,
  isStale,
  reason,
}: {
  date: string;
  isStale: boolean;
  reason: string | null;
}) {
  const label = isStale ? "Stale" : freshnessLabel(date);
  return (
    <span
      className={`badge freshness ${label.toLowerCase()}`}
      title={reason ?? undefined}
    >
      {label}
    </span>
  );
}

function LeaderboardTable({
  entries,
  liveEstimates,
  sortEpoch,
}: {
  entries: RankingEntry[];
  liveEstimates: ReadonlyMap<string, LiveEstimate>;
  sortEpoch: number;
}) {
  if (!entries.length)
    return <p className="empty">No ranked entries match these filters.</p>;
  return (
    <div className="table-shell ranking-shell">
      <table className="ranking-table">
        <thead>
          <tr>
            <th>Published rank</th>
            <th>Move</th>
            <th>Founding unit</th>
            <th>Project</th>
            <th className="number">Estimated outside-holder token value</th>
            <th className="number desktop-detail">24h</th>
            <th className="number desktop-detail">Excluded holdings</th>
            <th className="number desktop-detail">Capital deducted</th>
            <th>Confidence</th>
            <th>Freshness</th>
          </tr>
        </thead>
        <tbody
          key={sortEpoch}
          className={sortEpoch ? "live-resort" : undefined}
        >
          {entries.map((entry) => {
            const rankMovement = movement(entry.rankChange);
            const liveEstimate = liveEstimates.get(entry.foundingUnitId);
            return (
              <tr key={entry.foundingUnitId}>
                <td
                  className="rank cell-rank"
                  aria-label={`Published rank ${entry.rank}`}
                >
                  {entry.rank}
                </td>
                <td className={`${rankMovement.className} cell-rank-move`}>
                  {rankMovement.label}
                </td>
                <td className="cell-founder">
                  <strong>{entry.displayName}</strong>
                </td>
                <td className="cell-project">
                  <ProjectNames entry={entry} />
                </td>
                <td className="number score cell-score">
                  <strong>
                    {money(liveEstimate?.scoreUsd ?? entry.scoreUsd)}
                  </strong>
                  <span className={liveEstimate?.stale ? "stale" : undefined}>
                    {liveEstimate
                      ? liveEstimate.stale
                        ? "Last live estimate"
                        : "Live estimate"
                      : "Published score"}
                  </span>
                  {liveEstimate ? (
                    <small>Published {money(entry.scoreUsd)}</small>
                  ) : null}
                </td>
                <td
                  className="number muted cell-market-change"
                  data-mobile-label="24h"
                >
                  —
                </td>
                <td className="number cell-excluded">
                  {money(entry.excludedHoldingsUsd)}
                </td>
                <td className="number cell-capital">
                  {money(entry.capitalDeductedUsd)}
                </td>
                <td className="cell-confidence">
                  <ConfidenceBadge value={entry.confidence} />
                </td>
                <td className="cell-freshness">
                  <FreshnessBadge
                    date={entry.freshestObservationAt}
                    isStale={entry.isStale}
                    reason={entry.staleReason}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function loadRanking(): Promise<RankingEntry[]> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !publicKey)
    throw new Error("Public data connection is not configured.");

  const headers = { apikey: publicKey, Authorization: `Bearer ${publicKey}` };
  const [leaderboardResponse, projectResponse] = await Promise.all([
    fetch(
      `${baseUrl}/rest/v1/public_leaderboard?select=*&order=rank.asc.nullslast`,
      { headers },
    ),
    fetch(`${baseUrl}/rest/v1/public_project_details?select=*`, { headers }),
  ]);
  if (!leaderboardResponse.ok || !projectResponse.ok) {
    throw new Error(
      "The published ranking endpoint is temporarily unavailable.",
    );
  }
  return buildRankingEntries(
    (await leaderboardResponse.json()) as RawLeaderboardRow[],
    (await projectResponse.json()) as RawProjectDetail[],
  );
}

export function RankingDashboard() {
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [confidence, setConfidence] = useState("all");
  const [project, setProject] = useState("all");
  const [liveSorting, setLiveSorting] = useState(true);
  const [liveOrder, setLiveOrder] = useState<string[]>([]);
  const [sortEpoch, setSortEpoch] = useState(0);

  useEffect(() => {
    loadRanking()
      .then(setEntries)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error ? reason.message : "Data unavailable.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const { prices, connectionState, rejectedCount, supportedProductCount } =
    useLivePrices(entries);
  const liveEstimates = useMemo(() => {
    const estimates = new Map<string, LiveEstimate>();
    for (const entry of entries) {
      const estimate = calculateEntryLiveEstimate(entry, prices);
      if (estimate) estimates.set(entry.foundingUnitId, estimate);
    }
    return estimates;
  }, [entries, prices]);

  const filtered = useMemo(
    () => filterEntries(entries, query, confidence, project),
    [entries, query, confidence, project],
  );
  const ranked = filtered.filter(({ status }) => status === "ranked");
  const rankedRef = useRef(ranked);
  const liveEstimatesRef = useRef(liveEstimates);

  useEffect(() => {
    rankedRef.current = ranked;
    liveEstimatesRef.current = liveEstimates;
  }, [ranked, liveEstimates]);

  useEffect(() => {
    if (!liveSorting) return;
    const sortNow = () => {
      const hasFreshLiveEstimate = [...liveEstimatesRef.current.values()].some(
        ({ stale }) => !stale,
      );
      if (!hasFreshLiveEstimate) return;
      const nextOrder = [...rankedRef.current]
        .sort((left, right) => {
          const leftScore =
            liveEstimatesRef.current.get(left.foundingUnitId)?.scoreUsd ??
            left.scoreUsd ??
            Number.NEGATIVE_INFINITY;
          const rightScore =
            liveEstimatesRef.current.get(right.foundingUnitId)?.scoreUsd ??
            right.scoreUsd ??
            Number.NEGATIVE_INFINITY;
          return rightScore - leftScore || (left.rank ?? 0) - (right.rank ?? 0);
        })
        .map(({ foundingUnitId }) => foundingUnitId);
      setLiveOrder(nextOrder);
      setSortEpoch((current) => current + 1);
    };
    sortNow();
    const timer = window.setInterval(sortNow, 10_000);
    return () => window.clearInterval(timer);
  }, [liveSorting]);

  const displayedRanked = useMemo(() => {
    if (!liveOrder.length) return ranked;
    const position = new Map(liveOrder.map((id, index) => [id, index]));
    return [...ranked].sort(
      (left, right) =>
        (position.get(left.foundingUnitId) ?? Number.MAX_SAFE_INTEGER) -
          (position.get(right.foundingUnitId) ?? Number.MAX_SAFE_INTEGER) ||
        (left.rank ?? 0) - (right.rank ?? 0),
    );
  }, [liveOrder, ranked]);
  const projects = Array.from(
    new Map(
      entries.flatMap((entry) => entry.projects.map((item) => [item.id, item])),
    ).values(),
  ).sort((a, b) => a.name.localeCompare(b.name));
  const newestObservation = entries
    .map(({ freshestObservationAt }) => freshestObservationAt)
    .sort()
    .at(-1);
  const status = newestObservation
    ? freshnessLabel(newestObservation)
    : "Offline";
  const liveStatus =
    supportedProductCount === 0
      ? "No supported pairs"
      : connectionState === "live"
        ? "Connected"
        : connectionState === "reconnecting"
          ? "Reconnecting"
          : "Connecting";

  return (
    <main id="main-content" tabIndex={-1}>
      <SiteNav />

      <header className="hero" id="top">
        <p className="eyebrow">Outside-holder value · Public beta</p>
        <h1>
          Crypto founding units,
          <br />
          <em>ranked by outside-holder value.</em>
        </h1>
        <p className="summary">
          A reviewed ranking of crypto founding units, with live market-price
          estimates for supported assets.
        </p>
        <div className="status-strip" aria-label="Ranking status">
          <div>
            <span className={`status-dot ${status.toLowerCase()}`} />{" "}
            <strong>{status}</strong>
          </div>
          <div>
            <span>Published calculation</span>
            <strong>{canonicalTime(entries)}</strong>
          </div>
          <div>
            <span>Ranked</span>
            <strong>{ranked.length}</strong>
          </div>
          <div>
            <span>Live price overlay</span>
            <strong>{liveStatus}</strong>
          </div>
        </div>
      </header>

      <section
        className="ranking-section"
        id="ranking"
        aria-labelledby="ranking-heading"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Published leaderboard</p>
            <h2 id="ranking-heading">The ranking</h2>
          </div>
          <p>
            Market value after approved project-affiliated holdings and
            qualifying outside capital are deducted.
          </p>
        </div>

        <div className="controls" aria-label="Ranking filters">
          <label className="search-field">
            <span>Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Founding unit or project"
              type="search"
            />
          </label>
          <label>
            <span>Confidence</span>
            <select
              value={confidence}
              onChange={(event) => setConfidence(event.target.value)}
            >
              <option value="all">All levels</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="insufficient">Insufficient</option>
            </select>
          </label>
          <label>
            <span>Project</span>
            <select
              value={project}
              onChange={(event) => setProject(event.target.value)}
            >
              <option value="all">All projects</option>
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <div className="sort-control">
            <span>Live sorting</span>
            <button
              type="button"
              aria-pressed={liveSorting}
              onClick={() => setLiveSorting((current) => !current)}
            >
              {liveSorting ? "Pause" : "Resume"}
            </button>
          </div>
        </div>

        {rejectedCount ? (
          <p className="overlay-warning" role="status">
            Live overlay disabled for {rejectedCount} price pair
            {rejectedCount === 1 ? "" : "s"} because variance exceeded 20%.
          </p>
        ) : null}

        {loading ? (
          <div className="notice" role="status">
            Loading published ranking…
          </div>
        ) : null}
        {error ? (
          <div className="notice warning" role="alert">
            <strong>Published data unavailable.</strong> {error} The site will
            never substitute fabricated values.
          </div>
        ) : null}
        {!loading && !error ? (
          <LeaderboardTable
            entries={displayedRanked}
            liveEstimates={liveEstimates}
            sortEpoch={sortEpoch}
          />
        ) : null}
      </section>

      <section
        className="methodology"
        id="methodology"
        aria-labelledby="methodology-heading"
      >
        <div>
          <p className="eyebrow">Transparent by design</p>
          <h2 id="methodology-heading">What the score means</h2>
        </div>
        <div className="formula">
          <span>Circulating market value</span>
          <b>−</b>
          <span>Approved affiliated holdings</span>
          <b>−</b>
          <span>Qualifying outside capital</span>
          <b>=</b>
          <strong>Estimated outside-holder token value</strong>
        </div>
        <p>
          The score is max(0, circulating market value − approved affiliated
          circulating holdings − reviewed disclosed outside capital). Market
          observations, public wallet attribution, circulating-supply
          classifications, and funding records feed the published calculation.
          Freshness labels reflect the latest market observation supporting each
          score. Public exchange prices may update a clearly labeled live
          estimate, but never replace the authoritative published score.
        </p>
      </section>

      <footer>
        <p>{DISCLAIMER}</p>
        <p className="footer-mark">
          Crypto Founding Units Index · Public methodology
        </p>
      </footer>
    </main>
  );
}
