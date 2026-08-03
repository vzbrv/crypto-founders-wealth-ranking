"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { UnifiedCalculation } from "@crypto-founders/curated-data/unified";

import { HourlySnapshotStatus } from "./hourly-snapshot-status";
import { formatRankChange } from "../lib/rank-change";

type LiveHeader = {
  utc_hour: string;
  observation_at: string;
  publication_at: string | null;
};
type LiveResult = {
  entry_id: string;
  rank: number;
  rank_change: number | null;
  final_value_usd: string | null;
  confidence_score: number;
  confidence_label: string;
};

const apiBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const LIVE_REFRESH_INTERVAL_MS = 60_000;

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
    const loadLive = async () => {
      try {
        const [headers, results] = await Promise.all([
          readView<LiveHeader>(
            "public_current_published_snapshot",
            "select=utc_hour,observation_at,publication_at&limit=1",
          ),
          readView<LiveResult>(
            "public_current_snapshot_results",
            "select=*&order=rank.asc",
          ),
        ]);
        const ranks = results
          .map((result) => result.rank)
          .sort((a, b) => a - b);
        const header = headers[0];
        const valid =
          Boolean(header) &&
          results.length === 20 &&
          ranks.every((rank, index) => rank === index + 1) &&
          results.every(
            (result) =>
              fallbackRanking.some(
                ({ entry }) => entry.entryId === result.entry_id,
              ) && result.final_value_usd !== null,
          );
        if (active && valid && header) setLive({ header, results });
      } catch {
        // The bundled July 30 data remains the safe static-export fallback.
      }
    };
    void loadLive();
    const interval = window.setInterval(() => {
      void loadLive();
    }, LIVE_REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
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
        };
      })
    : fallbackRanking.map((calculation) => ({
        ...calculation,
        rankChange: null,
        rankChangeSource: "fallback" as const,
      }));
  return (
    <>
      <HourlySnapshotStatus
        variant="summary"
        fallbackSnapshotDate={fallbackSnapshotDate}
        fallbackObservationDate={fallbackObservationDate}
      />
      <div className="table-shell evidence-shell">
        <table className="evidence-table research-universe-table">
          <caption className="sr-only">
            Current top 20 with estimated value created and confidence.
          </caption>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Rank change</th>
              <th className="founder-column">Founder or joint founding team</th>
              <th className="project-column">Project or company</th>
              <th>Value type</th>
              <th className="number">Provisional value created</th>
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
              }) => (
                <tr key={entry.entryId}>
                  <td className="rank">{entry.rank}</td>
                  <td className="rank-move">
                    {(() => {
                      const movement = formatRankChange(
                        rankChange,
                        rankChangeSource,
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
                  <td className="number">
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
