"use client";

import { useEffect, useMemo, useState } from "react";

type ProviderStatusRow = {
  checked_at: string;
  freshness: "current" | "stale";
  latency_ms: number | null;
  provider: string;
  status: string;
};

type ProviderQuotaStatusRow = {
  provider: string;
  plan: string;
  provider_docs_url: string;
  documented_monthly_quota: number;
  hard_monthly_request_limit: number;
  estimated_monthly_requests: number;
  monthly_request_count: number;
  remaining_requests: number;
  status: string;
  pause_reason: string | null;
  paused_at: string | null;
  scheduled_updates_enabled: boolean;
  paused_provider: string | null;
  paused_condition: string | null;
  scheduler_paused_at: string | null;
};

type ArkhamProviderStatusRow = {
  enabled: boolean;
  monthly_credit_limit: number | null;
  credits_used: number;
  status: string;
  last_success_at: string | null;
  last_run_status: string | null;
  last_run_completed_at: string | null;
  paused_reason: string | null;
  updated_at: string;
};

type LoadState =
  | { kind: "loading" }
  | {
      kind: "ready";
      rows: ProviderStatusRow[];
      quotaRows: ProviderQuotaStatusRow[];
      arkhamRows: ArkhamProviderStatusRow[];
    }
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

function parseProviderQuotaStatusRows(
  value: unknown,
): ProviderQuotaStatusRow[] | null {
  if (!Array.isArray(value)) return null;

  const rows: ProviderQuotaStatusRow[] = [];
  for (const row of value) {
    if (
      typeof row !== "object" ||
      row === null ||
      typeof row.provider !== "string" ||
      typeof row.plan !== "string" ||
      typeof row.provider_docs_url !== "string" ||
      typeof row.documented_monthly_quota !== "number" ||
      typeof row.hard_monthly_request_limit !== "number" ||
      typeof row.estimated_monthly_requests !== "number" ||
      typeof row.monthly_request_count !== "number" ||
      typeof row.remaining_requests !== "number" ||
      typeof row.status !== "string" ||
      (row.pause_reason !== null && typeof row.pause_reason !== "string") ||
      (row.paused_at !== null && typeof row.paused_at !== "string") ||
      typeof row.scheduled_updates_enabled !== "boolean" ||
      (row.paused_provider !== null &&
        typeof row.paused_provider !== "string") ||
      (row.paused_condition !== null &&
        typeof row.paused_condition !== "string") ||
      (row.scheduler_paused_at !== null &&
        typeof row.scheduler_paused_at !== "string")
    ) {
      return null;
    }

    rows.push(row as ProviderQuotaStatusRow);
  }

  return rows;
}

function parseArkhamProviderStatusRows(
  value: unknown,
): ArkhamProviderStatusRow[] | null {
  if (!Array.isArray(value)) return null;

  const rows: ArkhamProviderStatusRow[] = [];
  for (const row of value) {
    if (
      typeof row !== "object" ||
      row === null ||
      typeof row.enabled !== "boolean" ||
      (row.monthly_credit_limit !== null &&
        typeof row.monthly_credit_limit !== "number") ||
      typeof row.credits_used !== "number" ||
      typeof row.status !== "string" ||
      (row.last_success_at !== null &&
        typeof row.last_success_at !== "string") ||
      (row.last_run_status !== null &&
        typeof row.last_run_status !== "string") ||
      (row.last_run_completed_at !== null &&
        typeof row.last_run_completed_at !== "string") ||
      (row.paused_reason !== null && typeof row.paused_reason !== "string") ||
      typeof row.updated_at !== "string"
    ) {
      return null;
    }

    rows.push(row as ArkhamProviderStatusRow);
  }

  return rows;
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
    const request = (path: string) =>
      fetch(url + path, {
        headers: { apikey: key },
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok) throw new Error("Provider status request failed");
        return response.json();
      });

    const providerStatusRequest = request(
      "/rest/v1/public_provider_status?select=provider,checked_at,status,latency_ms,freshness&order=provider.asc",
    ).then(parseProviderStatusRows);
    const quotaStatusRequest = request(
      "/rest/v1/public_provider_quota_status?select=provider,plan,provider_docs_url,documented_monthly_quota,hard_monthly_request_limit,estimated_monthly_requests,monthly_request_count,remaining_requests,status,pause_reason,paused_at,scheduled_updates_enabled,paused_provider,paused_condition,scheduler_paused_at&order=provider.asc",
    )
      .then(parseProviderQuotaStatusRows)
      .catch(() => []);
    const arkhamStatusRequest = request(
      "/rest/v1/public_arkham_provider_status?select=enabled,monthly_credit_limit,credits_used,status,last_success_at,last_run_status,last_run_completed_at,paused_reason,updated_at&limit=1",
    )
      .then(parseArkhamProviderStatusRows)
      .catch(() => []);

    void Promise.all([
      providerStatusRequest,
      quotaStatusRequest,
      arkhamStatusRequest,
    ])
      .then(([rows, quotaRows, arkhamRows]) => {
        if (!rows || !quotaRows || !arkhamRows)
          throw new Error("Provider status response is invalid");
        setState({ kind: "ready", rows, quotaRows, arkhamRows });
      })
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
      <h2 id="arkham-provider-heading">Arkham API</h2>
      {state.arkhamRows.length === 0 ? (
        <div className="notice" role="status">
          Arkham API status is unavailable. No health state is inferred.
        </div>
      ) : (
        <div className="table-scroll">
          <table className="provider-table">
            <caption className="visually-hidden">
              Arkham API operational status and credit usage
            </caption>
            <thead>
              <tr>
                <th scope="col">State</th>
                <th scope="col">Enabled</th>
                <th scope="col">Credits used</th>
                <th scope="col">Last successful run</th>
                <th scope="col">Latest run</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {state.arkhamRows.map((row) => (
                <tr key={row.updated_at}>
                  <td>{row.status}</td>
                  <td>{row.enabled ? "Yes" : "No"}</td>
                  <td>
                    {row.credits_used.toLocaleString()}
                    {row.monthly_credit_limit === null
                      ? " (no limit configured)"
                      : ` of ${row.monthly_credit_limit.toLocaleString()}`}
                  </td>
                  <td>
                    {row.last_success_at
                      ? formatTime(row.last_success_at)
                      : "Not recorded"}
                  </td>
                  <td>
                    {row.last_run_status
                      ? formatProvider(row.last_run_status) +
                        (row.last_run_completed_at
                          ? " (" + formatTime(row.last_run_completed_at) + ")"
                          : "")
                      : "Not recorded"}
                  </td>
                  <td>{formatTime(row.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {state.arkhamRows.some((row) => row.paused_reason) && (
            <div className="notice" role="status">
              {state.arkhamRows
                .filter((row) => row.paused_reason)
                .map((row) => `Paused: ${row.paused_reason}`)
                .join(" ")}
            </div>
          )}
        </div>
      )}
      <h2 id="provider-quota-heading">Free-tier quota protection</h2>
      {state.quotaRows.length === 0 ? (
        <div className="notice" role="status">
          No provider quota records have been published. Quota status is
          unknown.
        </div>
      ) : (
        <>
          {state.quotaRows.some(
            (row) =>
              !row.scheduled_updates_enabled ||
              row.status === "Paused — provider quota exhausted",
          ) && (
            <div className="notice" role="status">
              Paused — provider quota exhausted.{" "}
              {state.quotaRows
                .filter(
                  (row) =>
                    !row.scheduled_updates_enabled ||
                    row.status === "Paused — provider quota exhausted",
                )
                .map(
                  (row) =>
                    formatProvider(row.provider) +
                    ": " +
                    (row.pause_reason ?? "quota condition unknown") +
                    "; paused " +
                    formatTime(row.paused_at ?? row.scheduler_paused_at ?? "") +
                    ".",
                )
                .join(" ")}{" "}
              Manual resume is required before updates can resume.
            </div>
          )}
          <div className="table-scroll">
            <table className="provider-table">
              <caption className="visually-hidden">
                Provider free-tier quota usage and pause status
              </caption>
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Estimated monthly requests</th>
                  <th scope="col">Hard monthly limit</th>
                  <th scope="col">Used / remaining</th>
                  <th scope="col">Updates</th>
                  <th scope="col">Pause condition</th>
                </tr>
              </thead>
              <tbody>
                {state.quotaRows.map((row) => (
                  <tr key={row.provider}>
                    <th scope="row">
                      <a
                        href={row.provider_docs_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {formatProvider(row.provider)}
                      </a>
                    </th>
                    <td>{row.plan}</td>
                    <td>{row.estimated_monthly_requests.toLocaleString()}</td>
                    <td>{row.hard_monthly_request_limit.toLocaleString()}</td>
                    <td>
                      {row.monthly_request_count.toLocaleString()} /{" "}
                      {row.remaining_requests.toLocaleString()}
                    </td>
                    <td>
                      {row.scheduled_updates_enabled ? "Active" : "Paused"}
                    </td>
                    <td>
                      {row.pause_reason ?? "None"}
                      {row.paused_at
                        ? " (" + formatTime(row.paused_at) + ")"
                        : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
