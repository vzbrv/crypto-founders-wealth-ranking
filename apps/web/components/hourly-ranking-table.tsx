"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { UnifiedCalculation } from "@crypto-founders/curated-data/unified";

import { HourlySnapshotStatus } from "./hourly-snapshot-status";
import { formatRankChange, type RankChangeStatus } from "../lib/rank-change";

type LiveHeader = {
  utc_hour: string;
  observation_at: string;
  publication_at: string | null;
  is_immutable?: boolean;
};
type LiveResult = {
  entry_id: string;
  rank: number;
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

function money(value: string | null): string {
  if (value === null || !Number.isFinite(Number(value))) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number(value));
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

  useEffect(() => {
    let active = true;
    void Promise.all([
      readView<LiveHeader>(
        "public_current_published_snapshot",
        "select=utc_hour,observation_at,publication_at,is_immutable&limit=1",
      ),
      readView<LiveResult>(
        "public_current_snapshot_results",
        "select=*&order=rank.asc",
      ),
    ])
      .then(([headers, results]) => {
        const ranks = results
          .map((result) => result.rank)
          .sort((a, b) => a - b);
        const header = headers[0];
        const valid =
          Boolean(header) &&
          !header?.is_immutable &&
          results.length === 20 &&
          ranks.every((rank, index) => rank === index + 1) &&
          results.every(
            (result) =>
              fallbackRanking.some(
                ({ entry }) => entry.entryId === result.entry_id,
              ) && result.final_value_usd !== null,
          );
        if (active && valid && header) setLive({ header, results });
      })
      .catch(() => {
        // The bundled July 30 data remains the safe static-export fallback.
      });
    return () => {
      active = false;
    };
  }, [fallbackRanking]);

  const rows = live
    ? live.results.map((result) => {
        const fallback = fallbackRanking.find(
          ({ entry }) => entry.entryId === result.entry_id,
        )!;
        return {
          ...fallback,
          provisionalValueCreatedUsd: result.final_value_usd!,
          entry: {
            ...fallback.entry,
            rank: result.rank,
            confidence: {
              ...fallback.entry.confidence,
              score: result.confidence_score,
              label:
                result.confidence_label as typeof fallback.entry.confidence.label,
            },
          },
          upperEstimate: fallback.upperEstimate,
          rankChange: result.rank_change,
          rankChangeSource: "live" as const,
          rankChangeStatus: result.rank_change_status,
        };
      })
    : fallbackRanking.map((calculation) => ({
        ...calculation,
        rankChange: null,
        rankChangeSource: "fallback" as const,
        rankChangeStatus: "baseline" as const,
      }));
  const snapshotDate = live?.header.utc_hour ?? fallbackSnapshotDate;
  const observationDate =
    live?.header.observation_at ?? fallbackObservationDate;

  return (
    <>
      <HourlySnapshotStatus
        variant="summary"
        fallbackSnapshotDate={snapshotDate}
        fallbackObservationDate={observationDate}
      />
      <p className="table-scroll-note">
        Scroll horizontally to view the complete ranking on smaller screens.
      </p>
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
                entry,
                provisionalValueCreatedUsd,
                upperEstimate,
                rankChange,
                rankChangeSource,
                rankChangeStatus,
              }) => (
                <tr key={entry.entryId}>
                  <td className="rank">{entry.rank}</td>
                  <td className="rank-move">
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
                  <td>
                    <Link href={`/ranking/${entry.entryId}/`}>
                      <strong>{entry.founderTeam}</strong>
                    </Link>
                    <small>
                      <Link href={`/ranking/${entry.entryId}/`}>
                        Calculation &amp; sources
                      </Link>
                    </small>
                  </td>
                  <td>
                    <strong>{entry.project}</strong>
                    {entry.market.type === "public" && (
                      <small>
                        {entry.market.ticker} · {entry.market.exchange}
                      </small>
                    )}
                  </td>
                  <td>{entry.valueType}</td>
                  <td className="number primary-value">
                    <strong>{money(provisionalValueCreatedUsd)}</strong>
                    {upperEstimate && <small>Upper estimate</small>}
                  </td>
                  <td>
                    {entry.confidence.score}/100 · {entry.confidence.label}
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
