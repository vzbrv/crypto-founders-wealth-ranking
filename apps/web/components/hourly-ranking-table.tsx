"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { UnifiedCalculation } from "@crypto-founders/curated-data/unified";

import { formatRankChange, type RankChangeStatus } from "../lib/rank-change";
import { formatValueChange } from "../lib/value-change";
import {
  formatV2Rank,
  formatV2Value,
  isNewerPublishedSnapshot,
  validateCurrentRankingV2,
  type CurrentRankingV2,
} from "../lib/ranking-v2";

type LiveHeader = {
  id: string;
  utc_hour: string;
  observation_at: string;
  publication_at: string;
};
type LiveResult = {
  snapshot_id: string;
  utc_hour: string;
  publication_at: string | null;
  entry_id: string;
  rank: number;
  value_type: string;
  gross_value_usd: string | null;
  final_value_usd: string | null;
  previous_final_value_usd: string | null;
  value_change_usd: string | null;
  confidence_score: number;
  confidence_label: string;
  source_ids: string[];
  observation_at: string;
  freshness_status: "current" | "stale" | "historical";
  previous_rank: number | null;
  rank_change: number | null;
  rank_change_status: RankChangeStatus;
  founder_team: string;
  project: string;
  market: unknown;
  upper_estimate: boolean;
};
type LatestStatus = {
  status: string;
  publication_at: string | null;
  observation_at: string;
  failure_reason: string | null;
};
const apiBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function readView<T>(view: string, query: string): Promise<T[]> {
  if (!apiBase || !apiKey) throw new Error("public data endpoint unavailable");
  const response = await fetch(`${apiBase}/rest/v1/${view}?${query}`, {
    headers: { apikey: apiKey },
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`public data request failed: ${response.status}`);
  return (await response.json()) as T[];
}

async function readRpc<T>(functionName: string): Promise<T> {
  if (!apiBase || !apiKey) throw new Error("public data endpoint unavailable");
  const response = await fetch(`${apiBase}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`public data request failed: ${response.status}`);
  return (await response.json()) as T;
}

function money(value: string | number | null): string {
  if (value === null || !Number.isFinite(Number(value))) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function dateTime(value: string | null): string {
  if (!value) return "not published";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function publicMarketLabel(market: unknown): string | null {
  if (!market || typeof market !== "object") return null;
  const value = market as Record<string, unknown>;
  if (value.type !== "public") return null;
  return [value.ticker, value.exchange]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" · ");
}

function aggregateFreshness(
  results: LiveResult[],
): LiveResult["freshness_status"] {
  if (results.some((result) => result.freshness_status === "historical"))
    return "historical";
  if (results.some((result) => result.freshness_status === "stale"))
    return "stale";
  return "current";
}

function validTimestamp(value: string | null | undefined): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validateLegacySnapshot(
  results: LiveResult[],
  expectedCount: number,
): { header: LiveHeader; results: LiveResult[] } | null {
  const ranks = results.map((result) => result.rank).sort((a, b) => a - b);
  const first = results[0];
  const header = first?.publication_at
    ? {
        id: first.snapshot_id,
        utc_hour: first.utc_hour,
        observation_at: first.observation_at,
        publication_at: first.publication_at,
      }
    : null;
  const valid =
    Boolean(header?.id) &&
    validTimestamp(header?.utc_hour) &&
    validTimestamp(header?.observation_at) &&
    validTimestamp(header?.publication_at) &&
    results.length === expectedCount &&
    new Set(results.map((result) => result.entry_id)).size === expectedCount &&
    ranks.every((rank, index) => rank === index + 1) &&
    results.every(
      (result) =>
        result.snapshot_id === header?.id &&
        result.utc_hour === header?.utc_hour &&
        result.observation_at === header?.observation_at &&
        result.publication_at === header?.publication_at &&
        result.entry_id !== "" &&
        result.founder_team !== "" &&
        result.project !== "" &&
        result.final_value_usd !== null,
    );
  return valid && header ? { header, results } : null;
}

export function HourlyRankingTable({
  fallbackRanking,
  fallbackSnapshotDate,
  fallbackObservationDate,
}: {
  fallbackRanking: UnifiedCalculation[];
  fallbackSnapshotDate: string;
  fallbackObservationDate: string;
}) {
  const [rankingV2, setRankingV2] = useState<CurrentRankingV2 | null>(null);
  const [live, setLive] = useState<{
    header: LiveHeader;
    results: LiveResult[];
  } | null>(null);
  const [latestStatus, setLatestStatus] = useState<LatestStatus | null>(null);
  const [endpointError, setEndpointError] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const nextLatestStatus = await readView<LatestStatus>(
        "public_latest_snapshot_status",
        "select=status,publication_at,observation_at,failure_reason&limit=1",
      )
        .then((statuses) => statuses[0] ?? null)
        .catch(() => null);

      if (!active) return;
      setLatestStatus(nextLatestStatus);

      let nextV2: CurrentRankingV2 | null = null;

      try {
        const response = await readRpc<unknown>("get_current_ranking_v2");
        nextV2 = validateCurrentRankingV2(response);
      } catch {
        // A verified legacy snapshot may still be available.
      }

      const shouldCheckLegacy =
        !nextV2 ||
        isNewerPublishedSnapshot(
          nextLatestStatus?.status,
          nextLatestStatus?.publication_at,
          nextV2.publishedAt,
        );

      if (nextV2 && !shouldCheckLegacy) {
        setRankingV2(nextV2);
        setLive(null);
        setEndpointError(false);
        return;
      }

      try {
        const results = await readView<LiveResult>(
          "public_current_snapshot_results",
          "select=*&order=rank.asc",
        );
        const nextLegacy = validateLegacySnapshot(
          results,
          fallbackRanking.length,
        );
        if (!nextLegacy) throw new Error("invalid legacy snapshot");
        if (!active) return;
        if (
          nextV2 &&
          !isNewerPublishedSnapshot(
            "published",
            nextLegacy.header.publication_at,
            nextV2.publishedAt,
          )
        ) {
          setRankingV2(nextV2);
          setLive(null);
        } else {
          setRankingV2(null);
          setLive(nextLegacy);
        }
        setEndpointError(false);
      } catch {
        if (!active) return;
        if (nextV2) {
          setRankingV2(nextV2);
          setLive(null);
        }
        setEndpointError(true);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [fallbackRanking.length]);

  const rows = rankingV2
    ? rankingV2.rows.map((result) => {
        const fallback = fallbackRanking.find(
          ({ entry }) =>
            entry.entryId === result.project_slug ||
            entry.entryId === result.economic_project_id,
        );
        return {
          entryId: result.economic_project_id,
          rank: formatV2Rank(result),
          founderTeam: result.founder_team,
          project: result.project_name,
          marketLabel: null,
          valueType: "Value created for others",
          formattedValue: formatV2Value(result),
          valueNote:
            result.eligibility_status === "ineligible"
              ? "Not eligible for official rank"
              : result.eligibility_status === "provisional"
                ? "Provisional interval"
                : null,
          confidenceText: result.confidence_status,
          confidenceNote: `Rank order: ${result.rank_order_status.replace(/_/g, " ")}`,
          movement: {
            text: "—",
            label: "Rank movement is not published for v2 snapshots",
          },
          valueMovement: formatValueChange(null, "v2"),
          href: fallback ? `/ranking/${fallback.entry.entryId}/` : null,
        };
      })
    : live
      ? live.results.map((result) => {
          const fallback = fallbackRanking.find(
            ({ entry }) => entry.entryId === result.entry_id,
          );
          const movement = formatRankChange(
            result.rank_change,
            "live",
            result.rank_change_status,
          );
          return {
            entryId: result.entry_id,
            rank: result.rank,
            founderTeam: result.founder_team,
            project: result.project,
            marketLabel: publicMarketLabel(result.market),
            valueType: result.value_type,
            formattedValue: money(result.final_value_usd),
            valueNote: result.upper_estimate ? "Upper estimate" : null,
            confidenceText: `${result.confidence_score}/100 · ${result.confidence_label}`,
            confidenceNote: `Observation: ${result.freshness_status}`,
            movement,
            valueMovement: formatValueChange(result.value_change_usd, "live"),
            href: fallback ? `/ranking/${result.entry_id}/` : null,
          };
        })
      : fallbackRanking.map(
          ({ entry, provisionalValueCreatedUsd, upperEstimate }) => ({
            entryId: entry.entryId,
            rank: entry.rank,
            founderTeam: entry.founderTeam,
            project: entry.project,
            marketLabel:
              entry.market.type === "public"
                ? `${entry.market.ticker} · ${entry.market.exchange}`
                : null,
            valueType: entry.valueType,
            formattedValue: money(provisionalValueCreatedUsd),
            valueNote: upperEstimate ? "Upper estimate" : null,
            confidenceText: `${entry.confidence.score}/100 · ${entry.confidence.label}`,
            confidenceNote: "Observation: historical",
            movement: formatRankChange(null, "fallback", "baseline"),
            valueMovement: formatValueChange(null, "fallback"),
            href: `/ranking/${entry.entryId}/`,
          }),
        );
  const snapshotDate = live?.header.utc_hour ?? fallbackSnapshotDate;
  const observationDate =
    live?.header.observation_at ?? fallbackObservationDate;

  return (
    <>
      {rankingV2 ? (
        <p className="notice">
          Published v2 snapshot · Published {dateTime(rankingV2.publishedAt)}{" "}
          UTC · Economic as of {dateTime(rankingV2.economicAsOf)} UTC ·
          Knowledge cutoff {dateTime(rankingV2.knowledgeCutoff)} UTC.
        </p>
      ) : live ? (
        <p className="notice">
          Live immutable snapshot · Published{" "}
          {dateTime(live.header.publication_at)} UTC · Observed{" "}
          {dateTime(observationDate)} UTC · Data freshness:{" "}
          {aggregateFreshness(live.results)}.
        </p>
      ) : (
        <p className="notice warning">
          Showing the bundled snapshot from {dateTime(snapshotDate)} UTC. No
          complete immutable live snapshot is available.
        </p>
      )}
      {latestStatus?.status === "failed" && (
        <p className="notice warning" role="alert">
          Latest scheduled run failed. Showing the{" "}
          {rankingV2
            ? "last verified published v2"
            : live
              ? "last complete immutable"
              : "bundled"}{" "}
          snapshot
          {latestStatus.failure_reason
            ? `: ${latestStatus.failure_reason}`
            : "."}
        </p>
      )}
      {endpointError && (
        <p className="notice warning" role="alert">
          Live endpoint refresh failed. The{" "}
          {rankingV2
            ? "last verified published v2"
            : live
              ? "last verified immutable"
              : "bundled"}{" "}
          snapshot remains displayed.
        </p>
      )}
      <div className="table-shell evidence-shell">
        <table className="evidence-table research-universe-table">
          <caption className="sr-only">
            Current economic projects ranked by value created for others.
          </caption>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Rank change</th>
              <th>Founder or joint founding team</th>
              <th>Project or company</th>
              <th>Value type</th>
              <th className="number primary-value">Value created for others</th>
              <th className="number value-move">Value change</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(
              ({
                entryId,
                rank,
                founderTeam,
                project,
                marketLabel,
                valueType,
                formattedValue,
                valueNote,
                confidenceText,
                confidenceNote,
                movement,
                valueMovement,
                href,
              }) => (
                <tr key={entryId}>
                  <td className="rank" data-label="Rank">
                    {rank}
                  </td>
                  <td className="rank-move" data-label="Rank change">
                    <span aria-label={movement.label}>{movement.text}</span>
                  </td>
                  <td data-label="Founder / founding team">
                    {href ? (
                      <>
                        <Link href={href}>
                          <strong>{founderTeam}</strong>
                        </Link>
                        <small>
                          <Link href={href}>Calculation &amp; sources</Link>
                        </small>
                      </>
                    ) : (
                      <>
                        <strong>{founderTeam}</strong>
                        <small>Published snapshot record</small>
                      </>
                    )}
                  </td>
                  <td data-label="Project / company">
                    <strong>{project}</strong>
                    {marketLabel && <small>{marketLabel}</small>}
                  </td>
                  <td data-label="Value type">{valueType}</td>
                  <td
                    className="number primary-value"
                    data-label="Value created for others"
                  >
                    <strong>{formattedValue}</strong>
                    {valueNote && <small>{valueNote}</small>}
                  </td>
                  <td className="number value-move" data-label="Value change">
                    <span aria-label={valueMovement.label}>
                      {valueMovement.text}
                    </span>
                  </td>
                  <td data-label="Confidence">
                    {confidenceText}
                    <small>{confidenceNote}</small>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
