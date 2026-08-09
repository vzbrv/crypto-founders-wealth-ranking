"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { UnifiedCalculation } from "@crypto-founders/curated-data/unified";

import { formatRankChange, type RankChangeStatus } from "../lib/rank-change";

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

export function HourlyRankingTable({
  fallbackRanking,
  fallbackSnapshotDate,
  fallbackObservationDate,
}: {
  fallbackRanking: UnifiedCalculation[];
  fallbackSnapshotDate: string;
  fallbackObservationDate: string;
}) {
  const [live, setLive] = useState<{
    header: LiveHeader;
    results: LiveResult[];
  } | null>(null);
  const [latestStatus, setLatestStatus] = useState<LatestStatus | null>(null);
  const [endpointError, setEndpointError] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void readView<LatestStatus>(
        "public_latest_snapshot_status",
        "select=status,publication_at,observation_at,failure_reason&limit=1",
      )
        .then((statuses) => {
          if (active) setLatestStatus(statuses[0] ?? null);
        })
        .catch(() => undefined);

      // This view binds every result to the current published snapshot in one
      // database statement. Reading it once avoids combining two snapshots if
      // publication advances between requests.
      void readView<LiveResult>(
        "public_current_snapshot_results",
        "select=*&order=rank.asc",
      )
        .then((results) => {
          const ranks = results
            .map((result) => result.rank)
            .sort((a, b) => a - b);
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
            Boolean(header) &&
            Boolean(header?.id) &&
            validTimestamp(header?.utc_hour) &&
            validTimestamp(header?.observation_at) &&
            validTimestamp(header?.publication_at) &&
            results.length === fallbackRanking.length &&
            new Set(results.map((result) => result.entry_id)).size ===
              fallbackRanking.length &&
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
          if (!active) return;
          if (!valid || !header) throw new Error("invalid live snapshot");
          setLive({ header, results });
          setEndpointError(false);
        })
        .catch(() => {
          if (active) setEndpointError(true);
        });
    };
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [fallbackRanking.length]);

  const rows = live
    ? live.results.map((result) => {
        const fallback = fallbackRanking.find(
          ({ entry }) => entry.entryId === result.entry_id,
        );
        return {
          entryId: result.entry_id,
          rank: result.rank,
          founderTeam: result.founder_team,
          project: result.project,
          marketLabel: publicMarketLabel(result.market),
          valueType: result.value_type,
          provisionalValueCreatedUsd: result.final_value_usd,
          confidenceScore: result.confidence_score,
          confidenceLabel: result.confidence_label,
          upperEstimate: result.upper_estimate,
          rankChange: result.rank_change,
          rankChangeSource: "live" as const,
          rankChangeStatus: result.rank_change_status,
          freshnessStatus: result.freshness_status,
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
          provisionalValueCreatedUsd,
          confidenceScore: entry.confidence.score,
          confidenceLabel: entry.confidence.label,
          upperEstimate,
          rankChange: null,
          rankChangeSource: "fallback" as const,
          rankChangeStatus: "baseline" as const,
          freshnessStatus: "historical" as const,
          href: `/ranking/${entry.entryId}/`,
        }),
      );
  const snapshotDate = live?.header.utc_hour ?? fallbackSnapshotDate;
  const observationDate =
    live?.header.observation_at ?? fallbackObservationDate;

  return (
    <>
      {live ? (
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
          {live ? "last complete immutable" : "bundled"} snapshot
          {latestStatus.failure_reason
            ? `: ${latestStatus.failure_reason}`
            : "."}
        </p>
      )}
      {endpointError && (
        <p className="notice warning" role="alert">
          Live endpoint refresh failed. The{" "}
          {live ? "last verified immutable" : "bundled"} snapshot remains
          displayed.
        </p>
      )}
      <div className="table-shell evidence-shell">
        <table className="evidence-table research-universe-table">
          <caption className="sr-only">
            Current unified top 20 ranked by provisional value created.
          </caption>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Rank change</th>
              <th>Founder or joint founding team</th>
              <th>Project or company</th>
              <th>Value type</th>
              <th className="number primary-value">
                Provisional value created
              </th>
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
                provisionalValueCreatedUsd,
                confidenceScore,
                confidenceLabel,
                upperEstimate,
                rankChange,
                rankChangeSource,
                rankChangeStatus,
                freshnessStatus,
                href,
              }) => (
                <tr key={entryId}>
                  <td className="rank" data-label="Rank">
                    {rank}
                  </td>
                  <td className="rank-move" data-label="Rank change">
                    {(() => {
                      const movement = formatRankChange(
                        rankChange,
                        rankChangeSource,
                        rankChangeStatus,
                      );
                      return (
                        <span aria-label={movement.label}>{movement.text}</span>
                      );
                    })()}
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
                        <small>Live snapshot record</small>
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
                    data-label="Provisional value created"
                  >
                    <strong>{money(provisionalValueCreatedUsd)}</strong>
                    {upperEstimate && <small>Upper estimate</small>}
                  </td>
                  <td data-label="Confidence">
                    {confidenceScore}/100 · {confidenceLabel}
                    <small>Observation: {freshnessStatus}</small>
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
