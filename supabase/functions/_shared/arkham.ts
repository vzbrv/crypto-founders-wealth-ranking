export const ARKHAM_API_BASE_URL = "https://api.arkm.com";

export interface ArkhamClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  maxRetries?: number;
}

export class ArkhamApiError extends Error {
  readonly status: number | null;
  readonly endpoint: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    endpoint: string,
    status: number | null,
    retryable: boolean,
  ) {
    super(message);
    this.name = "ArkhamApiError";
    this.status = status;
    this.endpoint = endpoint;
    this.retryable = retryable;
  }
}

export interface ArkhamResponse<T> {
  data: T;
  endpoint: string;
  status: number;
  observedAt: string;
  rawResponseHash: string;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function joinUrl(baseUrl: string, endpoint: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${endpoint.replace(/^\//, "")}`;
}

function retryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export class ArkhamClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: ArkhamClientOptions) {
    if (!options.apiKey.trim()) throw new Error("Arkham API key is required");
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? ARKHAM_API_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.maxRetries = Math.max(0, Math.min(options.maxRetries ?? 2, 4));
  }

  async get<T>(endpoint: string): Promise<ArkhamResponse<T>> {
    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      let body = "";
      try {
        response = await this.fetchImpl(joinUrl(this.baseUrl, endpoint), {
          headers: { Accept: "application/json", "API-Key": this.apiKey },
          signal: controller.signal,
        });
        body = await response.text();
      } catch (error) {
        const timedOut =
          error instanceof DOMException && error.name === "AbortError";
        clearTimeout(timeout);
        if (attempt < this.maxRetries) {
          await this.sleep(250 * 2 ** attempt);
          attempt += 1;
          continue;
        }
        throw new ArkhamApiError(
          timedOut ? "Arkham request timed out" : "Arkham request failed",
          endpoint,
          null,
          true,
        );
      }
      clearTimeout(timeout);

      if (!response.ok) {
        const canRetry = retryableStatus(response.status);
        if (canRetry && attempt < this.maxRetries) {
          await this.sleep(250 * 2 ** attempt);
          attempt += 1;
          continue;
        }
        const message =
          response.status === 401
            ? "Arkham authentication failed"
            : response.status === 403
              ? "Arkham access denied"
              : response.status === 429
                ? "Arkham quota rate limited"
                : response.status >= 500
                  ? "Arkham upstream unavailable"
                  : "Arkham request rejected";
        throw new ArkhamApiError(message, endpoint, response.status, canRetry);
      }

      let data: T;
      try {
        data = JSON.parse(body) as T;
      } catch {
        throw new ArkhamApiError(
          "Arkham returned invalid JSON",
          endpoint,
          response.status,
          false,
        );
      }
      return {
        data,
        endpoint,
        status: response.status,
        observedAt: new Date().toISOString(),
        rawResponseHash: await sha256(body),
      };
    }
  }

  getChains<T = unknown>() {
    return this.get<T>("/chains");
  }
  search<T = unknown>(query: string) {
    return this.get<T>(
      `/intelligence/search?query=${encodeURIComponent(query)}`,
    );
  }
  getEntity<T = unknown>(entity: string) {
    return this.get<T>(`/intelligence/entity/${encodeURIComponent(entity)}`);
  }
  getEntityBalances<T = unknown>(entity: string) {
    return this.get<T>(`/balances/entity/${encodeURIComponent(entity)}`);
  }
  getEntityPredictions<T = unknown>(entity: string) {
    return this.get<T>(
      `/intelligence/entity_predictions/${encodeURIComponent(entity)}`,
    );
  }
  getEntityUpdates<T = unknown>() {
    return this.get<T>("/intelligence/entities/updates");
  }
  getAddressUpdates<T = unknown>() {
    return this.get<T>("/intelligence/addresses/updates");
  }
  getUsage<T = unknown>(endpoint = "/usage") {
    return this.get<T>(endpoint);
  }
  getCredits<T = unknown>(endpoint = "/credits") {
    return this.get<T>(endpoint);
  }

  getHyperCoreEntity<T = unknown>(entity: string, endpoint?: string | null) {
    if (!endpoint) return Promise.resolve(null);
    return this.get<T>(
      `${endpoint.replace(/\/$/, "")}/${encodeURIComponent(entity)}`,
    );
  }
  getHyperCoreAccount<T = unknown>(account: string, endpoint?: string | null) {
    if (!endpoint) return Promise.resolve(null);
    return this.get<T>(
      `${endpoint.replace(/\/$/, "")}/${encodeURIComponent(account)}`,
    );
  }
}
