"use client";

import { reportClientError } from "@crypto-founders/observability";
import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const endpoint = process.env.NEXT_PUBLIC_ERROR_REPORTING_ENDPOINT;
    void reportClientError(error, {
      context: { digest: error.digest ?? "unavailable" },
      ...(endpoint ? { endpoint } : {}),
      path: window.location.pathname,
    });
  }, [error]);

  return (
    <main className="content-page" id="main-content" tabIndex={-1}>
      <header className="page-header">
        <p className="eyebrow">Unexpected application error</p>
        <h1>Something went wrong.</h1>
        <p>
          The page could not be displayed. No missing value has been treated as
          zero.
        </p>
        <button className="primary-button" onClick={reset} type="button">
          Try again
        </button>
      </header>
    </main>
  );
}
