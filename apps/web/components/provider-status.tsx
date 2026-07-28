"use client";

import { useEffect, useMemo, useState } from "react";

type ProviderStatusRow = {
  checked_at: string;
  freshness: "current" | "stale";
  latency_ms: number | null;
  provider: string;
  status: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; rows: ProviderStatusRow[] }
  | { kind: "unavailable" };

function parseProviderStatusRows(value: unknown): ProviderStatusRow[] | null {
  if (!Array.isArray(value)) return null;

  const rows: ProviderStatusRow[] = [];
  for (const row of value) {
    if (
      typeof row !== "object" ||
      row === null ||
      !("provider" in row) ||
      typeof row.provider !== "string" ||
      !("checked_at" in row) ||
      typeof row.checked_at !== "string" ||
      !("status" in row) ||
      !["healthy", "degraded", "failed"].includes(String(row.status)) ||
      !("freshness" in row) ||
      !["current", "stale"].includes(String(row.freshness)) ||
      !("latency_ms" in row) ||
      (row.latency_ms !== null && typeof row.latency_ms !== "number")
    ) {
      return null;
    }

    rows.push(row as ProviderStatusRow);
  }

  return rows;
}

function formatProvider(provider: string) {
  return provider
    .replaceAll(/[-_]/g, " ")
    .replaceAll(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Unknown"
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(date) + " UTC";
}

export function ProviderStatus() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const [state, setState] = useState<LoadState>(
    url && key ? { kind: "loading" } : { kind: "unavailable" },
  );

  useEffect(() => {
    if (!url || !key) return;

    const controller = new AbortController();
    void fetch(
      `${url}/rest/v1/public_provider_status?select=provider,checked_at,status,latency_ms,freshness&order=provider.asc`,
      {
        headers: { apikey: key },
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Provider status request failed");
        const rows = parseProviderStatusRows(await response.json());
        if (!rows) throw new Error("Provider status response is invalid");
        return rows;
      })
      .then((rows) => setState({ kind: "ready", rows }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setState({ kind: "unavailable" });
      });

    return () => controller.abort();
  }, [key, url]);

  const summary = useMemo(() => {
    if (state.kind !== "ready" || state.rows.length === 0) return "Unknown";
    if (
      state.rows.every(
        (row) => row.status === "healthy" && row.freshness === "current",
      )
    )
      return "Operational";
    if (state.rows.some((row) => row.status === "failed")) return "Disrupted";
    return "Degraded";
  }, [state]);

  if (state.kind === "loading") {
    return <p role="status">Loading provider status…</p>;
  }

  if (state.kind === "unavailable") {
    return (
      <div className="notice" role="status">
        Live provider status is currently unavailable. No health state is
        inferred.
      </div>
    );
  }

  return (
    <section aria-labelledby="provider-status-heading" className="status-panel">
      <div className="status-summary">
        <div>
          <span>Overall status</span>
          <strong className={`status-label ${summary.toLowerCase()}`}>
            {summary}
          </strong>
        </div>
        <p>
          Status reflects the latest sanitized provider checks. A stale check
          cannot be considered operational.
        </p>
      </div>
      <h2 id="provider-status-heading">Data providers</h2>
      {state.rows.length === 0 ? (
        <div className="notice" role="status">
          No provider checks have been recorded. Status is unknown.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="provider-table">
            <caption className="visually-hidden">
              Latest provider monitoring checks
            </caption>
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">State</th>
                <th scope="col">Freshness</th>
                <th scope="col">Latency</th>
                <th scope="col">Checked</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.provider}>
                  <th scope="row">{formatProvider(row.provider)}</th>
                  <td>{row.status}</td>
                  <td>{row.freshness}</td>
                  <td>
                    {row.latency_ms === null
                      ? "Unknown"
                      : `${row.latency_ms} ms`}
                  </td>
                  <td>{formatTime(row.checked_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
