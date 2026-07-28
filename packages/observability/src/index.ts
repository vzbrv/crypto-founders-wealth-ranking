export type ErrorContext = Record<
  string,
  boolean | number | string | null | undefined
>;

export interface ClientErrorReportOptions {
  endpoint?: string;
  context?: ErrorContext;
  path?: string;
}

const sensitiveKey = /authorization|cookie|key|password|secret|token/i;

export function redactContext(context: ErrorContext = {}): ErrorContext {
  return Object.fromEntries(
    Object.entries(context).map(([key, value]) => [
      key,
      sensitiveKey.test(key) ? "[redacted]" : value,
    ]),
  );
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected error";
  return message.slice(0, 500);
}

export async function reportClientError(
  error: unknown,
  options: ClientErrorReportOptions = {},
): Promise<boolean> {
  if (!options.endpoint) return false;

  try {
    const response = await fetch(options.endpoint, {
      body: JSON.stringify({
        context: redactContext(options.context),
        message: errorMessage(error),
        path: options.path,
        timestamp: new Date().toISOString(),
      }),
      credentials: "omit",
      headers: { "content-type": "application/json" },
      keepalive: true,
      method: "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
}
