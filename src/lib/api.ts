import type { CompileRequest, CompileResponse, HealthResponse } from "../../shared/api.ts";

// Empty means same origin: in development Vite proxies /api to the compile
// server (see vite.config.ts); in production the server serves the frontend.
// Set VITE_API_BASE_URL only when the API lives on another origin.
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");

/** HTTP 429 from the API; `retryAfter` is in seconds. */
export class RateLimitError extends Error {
  readonly retryAfter: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  const text = await res.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // Not JSON: a proxy error page or similar. Report the HTTP status instead.
  }
  if (res.status === 429) {
    const b = body as { error?: string; retryAfter?: number } | undefined;
    const retryAfter = Number(res.headers.get("Retry-After")) || b?.retryAfter || 5;
    throw new RateLimitError(b?.error || `rate limit reached; try again in ${retryAfter} s`, retryAfter);
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | undefined)?.error;
    throw new Error(msg ? `${msg} (HTTP ${res.status})` : `compile server returned HTTP ${res.status} ${res.statusText}`.trim());
  }
  if (body === undefined) throw new Error("compile server returned a response that is not JSON");
  return body as T;
}

export function compile(req: CompileRequest, signal?: AbortSignal): Promise<CompileResponse> {
  return request<CompileResponse>("/api/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
}

export function health(signal?: AbortSignal): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health", { method: "GET", signal });
}

/** Wait `ms`, rejecting with an AbortError if `signal` fires first. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * compile(), retrying once when the server refuses because another request
 * from this browser is still finishing (a short Retry-After).
 */
export async function compileWithRetry(req: CompileRequest, signal?: AbortSignal): Promise<CompileResponse> {
  try {
    return await compile(req, signal);
  } catch (e) {
    if (e instanceof RateLimitError && e.retryAfter <= 2) {
      await sleep(e.retryAfter * 1000, signal);
      return compile(req, signal);
    }
    throw e;
  }
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}
