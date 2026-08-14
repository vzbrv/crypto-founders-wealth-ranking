"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SnapshotHeader = {
  id: string;
  utc_hour: string;
  observation_at: string;
  publication_at: string | null;
  status: "published" | "failed";
  calculation_version: string;
  provider_health: Record<string, unknown>;
  failure_reason: string | null;
};

type SnapshotResult = {
  entry_id: string;
  rank: number;
  final_value_usd: string | null;
  gross_value_usd: string | null;
  confidence_score: number;
  confidence_label: string;
  source_ids: string[];
  observation_at: string;
  publication_at: string | null;
  freshness_status: "current" | "stale" | "historical";
};

type SnapshotInput = {
  entry_id: string;
  original_observation_at: string | null;
  data_age_seconds: number | null;
  max_staleness_seconds: number | null;
  freshness_status: "current" | "stale" | "historical";
  source_ids: string[];
  metadata?: Record<string, unknown> | null;
};

type SnapshotSource = {
  source_id: string;
  source_name: string;
  source_url: string;
  observed_at: string;
  fetched_at: string;
};

type ProviderHealth = {
  provider: string;
  checked_at: string;
  status: string;
  freshness: string;
  safe_message: string | null;
};

const apiBase = process.env.NEXT_PUBLIC_SUPABASE_URL;
const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const endpointConfigured = Boolean(apiBase && apiKey);
const LIVE_REFRESH_INTERVAL_MS = 60_000;

async function readView<T>(view: string, query = ""): Promise<T[]> {
  if (!apiBase || !apiKey) throw new Error("public data endpoint unavailable");
  const response = await fetch(`${apiBase}/rest/v1/${view}?${query}`, {
    headers: { apikey: apiKey },
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`public data request failed: ${response.status}`);
  return (await response.json()) as T[];
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Unknown";
  return (
    new Intl.DateTimeFormat("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}

function stateLabel(status: string): string {
  return status === "stale"
    ? "Stale"
    : status === "historical"
      ? "Historical"
      : "Current";
}

export function HourlySnapshotStatus({
  variant,
  entryId,
  fallbackSnapshotDate,
  fallbackObservationDate,
}: {
  variant: "summary" | "detail" | "status";
  entryId?: string;
  fallbackSnapshotDate: string;
  fallbackObservationDate: string;
}) {
  const [header, setHeader] = useState<SnapshotHeader | null>(null);
  const [latestStatus, setLatestStatus] = useState<SnapshotHeader | null>(null);
  const [result, setResult] = useState<SnapshotResult | null>(null);
  const [input, setInput] = useState<SnapshotInput | null>(null);
  const [sources, setSources] = useState<SnapshotSource[]>([]);
  const [health, setHealth] = useState<ProviderHealth[]>([]);
  const [error, setError] = useState<string | null>(
    endpointConfigured ? null : "public data endpoint unavailable",
  );

  useEffect(() => {
    if (!endpointConfigured) return;
    let active = true;
    const loadStatus = async () => {
      try {
        const [headers, latestRows, results, inputs, sourceRows, healthRows] =
          await Promise.all([
            readView<SnapshotHeader>(
              "public_current_published_snapshot",
              "select=*&limit=1",
            ),
            readView<SnapshotHeader>(
              "public_latest_snapshot_status",
              "select=*&limit=1",
            ),
            entryId
              ? readView<SnapshotResult>(
                  "public_current_snapshot_results",
                  `entry_id=eq.${encodeURIComponent(entryId)}&limit=1`,
                )
              : Promise.resolve([]),
            entryId
              ? readView<SnapshotInput>(
                  "public_current_snapshot_inputs",
                  `entry_id=eq.${encodeURIComponent(entryId)}&limit=1`,
                )
              : Promise.resolve([]),
            readView<SnapshotSource>(
              "public_snapshot_sources",
              "select=*&order=observed_at.desc",
            ),
            readView<ProviderHealth>(
              "public_current_snapshot_provider_health",
              "select=*&order=provider.asc",
            ),
          ]);
        if (!active) return;
        setHeader(headers[0] ?? null);
        setLatestStatus(latestRows[0] ?? null);
        setResult(results[0] ?? null);
        setInput(inputs[0] ?? null);
        setSources(sourceRows);
        setHealth(healthRows);
        setError(null);
      } catch (caught) {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : "public data request failed",
          );
      }
    };
    void loadStatus();
    const interval = window.setInterval(() => {
      void loadStatus();
    }, LIVE_REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [entryId]);

  if (variant === "summary") {
    const snapshotDate = header?.utc_hour ?? fallbackSnapshotDate;
    const observationDate = header?.observation_at ?? fallbackObservationDate;
    const freshness =
      result?.freshness_status ?? (header ? "current" : "historical");
    return (
      <div
        className={`notice ${freshness === "stale" ? "warning" : ""}`}
        role="status"
      >
        <strong>
          {header
            ? "Live rank from the latest published hourly snapshot"
            : "Live data unavailable"}
        </strong>
        <p>
          {header
            ? `Published ${formatTimestamp(header.publication_at)}. UTC snapshot: ${formatTimestamp(snapshotDate)}. Market observation: ${formatTimestamp(observationDate)}. Status: ${stateLabel(freshness)}.`
            : `Showing the bundled snapshot published ${formatTimestamp(fallbackSnapshotDate)} from market observations at ${formatTimestamp(fallbackObservationDate)}. Rank changes populate after the first complete live hourly snapshot is published.`}
        </p>
        {error && (
          <small>
            {endpointConfigured
              ? "Live snapshot read failed; showing the bundled snapshot."
              : "This build has no public live-data endpoint configured."}
          </small>
        )}
      </div>
    );
  }

  if (variant === "detail") {
    const status =
      input?.freshness_status ?? result?.freshness_status ?? "historical";
    const sourceRows = (input?.source_ids ?? result?.source_ids ?? [])
      .map((sourceId) =>
        sources.find((source) => source.source_id === sourceId),
      )
      .filter((source): source is SnapshotSource => Boolean(source));
    return (
      <section
        className={`notice ${status === "stale" ? "warning" : ""}`}
        aria-label="Hourly snapshot status"
      >
        <strong>
          {header
            ? `${stateLabel(status)} live hourly snapshot`
            : "Live data unavailable — bundled baseline"}
        </strong>
        <p>
          {header
            ? `Snapshot: ${formatTimestamp(header.utc_hour)}. Market observation: ${formatTimestamp(input?.original_observation_at ?? result?.observation_at ?? fallbackObservationDate)}. Publication: ${formatTimestamp(header.publication_at)}.`
            : `Published ${formatTimestamp(fallbackSnapshotDate)} from market observations at ${formatTimestamp(fallbackObservationDate)}. Rank changes populate after the first complete live hourly snapshot is published.`}
        </p>
        <p>
          Evidence version:{" "}
          {typeof input?.metadata?.evidenceVersion === "string"
            ? input.metadata.evidenceVersion
            : "bundled reviewed ownership and capital evidence"}
          . Calculation version: {header?.calculation_version ?? "unified-v1"}.
          {input?.data_age_seconds != null &&
            ` Data age: ${Math.round(input.data_age_seconds / 60)} minutes.`}
        </p>
        {sourceRows.length > 0 && (
          <p>
            Source timestamps:{" "}
            {sourceRows
              .map(
                (source) =>
                  `${source.source_name} (${formatTimestamp(source.observed_at)})`,
              )
              .join("; ")}
            .
          </p>
        )}
        {status === "stale" && (
          <p className="status-label degraded">
            Stale-data warning: the previous valid market observation is being
            shown.
          </p>
        )}
        <Link href="/#ranking">Back to current ranking</Link>
      </section>
    );
  }

  const failed =
    Boolean(error) ||
    latestStatus?.status === "failed" ||
    health.some((item) => item.status !== "healthy" && item.status !== "ok");
  const degraded = failed || !header;
  return (
    <section
      className="status-panel"
      aria-labelledby="hourly-snapshot-status-heading"
    >
      <div className="section-heading compact">
        <div>
          <p className="eyebrow">Hourly publication</p>
          <h2 id="hourly-snapshot-status-heading">Snapshot freshness</h2>
        </div>
        <p className={`status-label ${degraded ? "degraded" : "operational"}`}>
          {degraded ? "Degraded" : "Operational"}
        </p>
      </div>
      <dl className="status-grid">
        <div>
          <dt>Latest live publication</dt>
          <dd>
            {header
              ? formatTimestamp(header.publication_at)
              : "No live snapshot published"}
          </dd>
        </div>
        <div>
          <dt>Live UTC snapshot</dt>
          <dd>{header ? formatTimestamp(header.utc_hour) : "Not available"}</dd>
        </div>
        <div>
          <dt>Freshness</dt>
          <dd>
            {header
              ? "Current live published snapshot"
              : "Historical bundled baseline (not live)"}
          </dd>
        </div>
      </dl>
      {latestStatus?.status === "failed" && (
        <div className="notice warning" role="alert">
          Latest hourly attempt failed:{" "}
          {latestStatus.failure_reason ?? "Required data was not publishable."}{" "}
          The previous valid snapshot remains published.
        </div>
      )}
      {health.length > 0 && (
        <div className="table-shell evidence-shell">
          <table className="evidence-table">
            <thead>
              <tr>
                <th>Provider</th>
                <th>Status</th>
                <th>Freshness</th>
                <th>Checked</th>
                <th>Safe message</th>
              </tr>
            </thead>
            <tbody>
              {health.map((item) => (
                <tr key={item.provider}>
                  <th scope="row">{item.provider}</th>
                  <td>{item.status}</td>
                  <td>{item.freshness}</td>
                  <td>{formatTimestamp(item.checked_at)}</td>
                  <td>{item.safe_message ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {error && (
        <p className="notice" role="status">
          {endpointConfigured
            ? "Live snapshot read failed; showing the bundled snapshot."
            : "This build has no public live-data endpoint configured; showing the bundled snapshot."}
        </p>
      )}
    </section>
  );
}
