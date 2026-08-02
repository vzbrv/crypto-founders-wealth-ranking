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
  gross_value_usd: string | null;
  final_value_usd: string | null;
  confidence_score: number;
  confidence_label: string;
  source_ids: string[];
  observation_at: string;
  freshness_status: "current" | "stale" | "historical";
};
type LiveInput = {
  entry_id: string;
  founder_affiliate_deduction_usd: string | null;
  outside_capital_deduction_usd: string | null;
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
    inputs: LiveInput[];
  } | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      readView<LiveHeader>(
        "public_current_published_snapshot",
        "select=utc_hour,observation_at,publication_at&limit=1",
      ),
      readView<LiveResult>(
        "public_current_snapshot_results",
        "select=*&order=rank.asc",
      ),
      readView<LiveInput>(
        "public_current_snapshot_inputs",
        "select=entry_id,founder_affiliate_deduction_usd,outside_capital_deduction_usd",
      ),
    ])
      .then(([headers, results, inputs]) => {
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
        if (active && valid && header) setLive({ header, results, inputs });
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
        const input = live.inputs.find(
          (candidate) => candidate.entry_id === result.entry_id,
        );
        return {
          ...fallback,
          grossMarketValueUsd: result.gross_value_usd,
          acceptedAffiliatedOwnershipUsd:
            input?.founder_affiliate_deduction_usd ?? null,
          acceptedOutsideCapitalUsd:
            input?.outside_capital_deduction_usd ?? null,
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
          liveObservationAt: result.observation_at,
          rankChange: null,
          rankChangeSource: "live" as const,
        };
      })
    : fallbackRanking.map((calculation) => ({
        ...calculation,
        liveObservationAt: null,
        rankChange: null,
        rankChangeSource: "fallback" as const,
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
      <div className="table-shell evidence-shell">
        <table className="evidence-table research-universe-table">
          <caption className="sr-only">
            Current unified top 20; all market values include the source
            observation timestamp.
          </caption>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Rank change</th>
              <th>Founder or joint founding team</th>
              <th>Project or company</th>
              <th>Value type</th>
              <th className="number">Gross market value</th>
              <th className="number">Affiliated ownership</th>
              <th className="number">Outside capital</th>
              <th className="number">Provisional value created</th>
              <th>Confidence</th>
              <th>Snapshot</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(
              ({
                entry,
                grossMarketValueUsd,
                acceptedAffiliatedOwnershipUsd,
                acceptedOutsideCapitalUsd,
                provisionalValueCreatedUsd,
                upperEstimate,
                liveObservationAt,
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
                  <td className="number">{money(grossMarketValueUsd)}</td>
                  <td className="number">
                    {money(acceptedAffiliatedOwnershipUsd)}
                  </td>
                  <td className="number">{money(acceptedOutsideCapitalUsd)}</td>
                  <td className="number">
                    <strong>{money(provisionalValueCreatedUsd)}</strong>
                    {upperEstimate && <small>Upper estimate</small>}
                  </td>
                  <td>
                    {entry.confidence.score}/100 · {entry.confidence.label}
                  </td>
                  <td>
                    <time dateTime={liveObservationAt ?? snapshotDate}>
                      {snapshotDate}
                    </time>
                    <small>
                      Observed {liveObservationAt ?? observationDate}
                    </small>
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
