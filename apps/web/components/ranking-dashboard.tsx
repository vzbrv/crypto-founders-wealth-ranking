"use client";

import { useEffect, useMemo, useState } from "react";

import {
  buildRankingEntries,
  filterEntries,
  freshnessLabel,
  type RankingEntry,
  type RawLeaderboardRow,
  type RawProjectDetail,
} from "../lib/ranking";
import { SiteNav } from "./site-nav";

const DISCLAIMER =
  "Scores are estimates based on public market data and public information about project-affiliated holdings and funding. Wallet attribution and circulating-supply classifications may be incomplete or disputed. The ranking does not measure personal net worth, realized investor profit, total social benefit, or investment performance.";

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
  if (!entries.length) return "Waiting for first canonical calculation";
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
          <a href={`/project/${slug}/`}>{name}</a>
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

function FreshnessBadge({ date }: { date: string }) {
  const label = freshnessLabel(date);
  return (
    <span className={`badge freshness ${label.toLowerCase()}`}>{label}</span>
  );
}

function LeaderboardTable({ entries }: { entries: RankingEntry[] }) {
  if (!entries.length)
    return <p className="empty">No ranked entries match these filters.</p>;
  return (
    <div className="table-shell ranking-shell">
      <table className="ranking-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Move</th>
            <th>Founder or team</th>
            <th>Project</th>
            <th className="number">Estimated outside wealth</th>
            <th className="number desktop-detail">24h</th>
            <th className="number desktop-detail">Excluded holdings</th>
            <th className="number desktop-detail">Capital deducted</th>
            <th>Confidence</th>
            <th>Freshness</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const rankMovement = movement(entry.rankChange);
            return (
              <tr key={entry.foundingUnitId}>
                <td className="rank cell-rank">{entry.rank}</td>
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
                  {money(entry.scoreUsd)}
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
                  <FreshnessBadge date={entry.freshestObservationAt} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResearchList({ entries }: { entries: RankingEntry[] }) {
  if (!entries.length)
    return <p className="empty">No research entries match these filters.</p>;
  return (
    <div className="research-grid">
      {entries.map((entry) => (
        <article className="research-card" key={entry.foundingUnitId}>
          <div>
            <p className="card-kicker">Unranked</p>
            <h3>{entry.displayName}</h3>
            <p>
              <ProjectNames entry={entry} />
            </p>
          </div>
          <ConfidenceBadge value={entry.confidence} />
          <p className="research-reason">
            {entry.warnings.join(" ") ||
              "Required public inputs are incomplete."}
          </p>
        </article>
      ))}
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
      `${baseUrl}/rest/v1/current_leaderboard?select=*&order=rank.asc.nullslast`,
      { headers },
    ),
    fetch(`${baseUrl}/rest/v1/public_project_details?select=*`, { headers }),
  ]);
  if (!leaderboardResponse.ok || !projectResponse.ok) {
    throw new Error(
      "The canonical ranking endpoint is temporarily unavailable.",
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

  const filtered = useMemo(
    () => filterEntries(entries, query, confidence, project),
    [entries, query, confidence, project],
  );
  const ranked = filtered.filter(({ status }) => status === "ranked");
  const research = filtered.filter(({ status }) => status === "research");
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

  return (
    <main>
      <SiteNav />

      <header className="hero" id="top">
        <p className="eyebrow">Outside-holder value · Public beta</p>
        <h1>
          Crypto founders,
          <br />
          <em>ranked by value created.</em>
        </h1>
        <p className="summary">
          A live ranking of crypto founders and founding teams by the estimated
          current market wealth their projects have created for outside holders.
        </p>
        <div className="status-strip" aria-label="Ranking status">
          <div>
            <span className={`status-dot ${status.toLowerCase()}`} />{" "}
            <strong>{status}</strong>
          </div>
          <div>
            <span>Canonical calculation</span>
            <strong>{canonicalTime(entries)}</strong>
          </div>
          <div>
            <span>Ranked</span>
            <strong>{ranked.length}</strong>
          </div>
          <div>
            <span>In research</span>
            <strong>{research.length}</strong>
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
            <p className="eyebrow">Canonical leaderboard</p>
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
              placeholder="Founder, team, or project"
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
        </div>

        {loading ? (
          <div className="notice" role="status">
            Loading canonical ranking…
          </div>
        ) : null}
        {error ? (
          <div className="notice warning" role="alert">
            <strong>Live data unavailable.</strong> {error} The site will never
            substitute fabricated values.
          </div>
        ) : null}
        {!loading && !error ? <LeaderboardTable entries={ranked} /> : null}
      </section>

      <section className="research-section" aria-labelledby="research-heading">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Not part of the ranking</p>
            <h2 id="research-heading">Research in progress</h2>
          </div>
          <p>
            Entries remain unranked until every required input meets the minimum
            confidence standard.
          </p>
        </div>
        {!loading && !error ? <ResearchList entries={research} /> : null}
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
          <strong>Estimated outside wealth</strong>
        </div>
        <p>
          Market observations, public wallet attribution, circulating-supply
          classifications, and funding records feed the canonical calculation.
          Freshness labels reflect the latest market observation supporting each
          score.
        </p>
      </section>

      <footer>
        <p>{DISCLAIMER}</p>
        <p className="footer-mark">
          Crypto Founders Wealth Index · Public methodology
        </p>
      </footer>
    </main>
  );
}
