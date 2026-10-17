import { ProviderError } from "./types";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchJsonOptions {
  headers?: Record<string, string>;
  retries?: number;
  timeoutMs?: number;
  /** Redact secrets from error messages. */
  redact?: string[];
  fetchImpl?: typeof fetch;
}

/** GET JSON with timeout and exponential-backoff retries on network errors, 429 and 5xx. */
export async function fetchJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
  const retries = opts.retries ?? 3;
  const f = opts.fetchImpl ?? fetch;
  const redact = (s: string) => (opts.redact ?? []).filter(Boolean).reduce((acc, r) => acc.split(r).join("***"), s);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000);
    try {
      const res = await f(url, { headers: opts.headers, signal: ctrl.signal, cache: "no-store" });
      const text = await res.text();
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        throw new ProviderError(
          redact(`HTTP ${res.status} from ${new URL(url).host}: ${text.slice(0, 300)}`),
          res.status,
          retryable,
        );
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new ProviderError(redact(`Malformed JSON from ${new URL(url).host}`), res.status, false);
      }
    } catch (e) {
      lastErr = e;
      const retryable = e instanceof ProviderError ? e.retryable : true;
      if (!retryable || attempt === retries) break;
      await sleep(Math.min(1000 * 2 ** attempt, 15_000));
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr instanceof ProviderError) throw lastErr;
  throw new ProviderError(redact(`Request failed: ${(lastErr as Error)?.message ?? String(lastErr)}`), undefined, true);
}

export function finiteOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}
