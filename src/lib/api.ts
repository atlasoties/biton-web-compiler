import {
  SIGNIN_REQUIRED,
  type AuthStatus,
  type AuthUser,
  type CompileRequest,
  type CompileResponse,
  type CompleteRequest,
  type CompleteResponse,
  type HealthResponse,
} from "../../shared/api.ts";

// Empty means same origin: in development Vite proxies /api to the compile
// server (see vite.config.ts); in production the server serves the frontend.
// Set VITE_API_BASE_URL only when the API lives on another origin.
const API_BASE = (
  (typeof import.meta.env === "object" ? import.meta.env.VITE_API_BASE_URL : "") ?? ""
).replace(/\/+$/, "");

/** HTTP 429 from the API; `retryAfter` is in seconds. */
export class RateLimitError extends Error {
  readonly retryAfter: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

/** HTTP 401: running programs needs a signed-in user (or the session expired). */
export class SignInRequiredError extends Error {}

/** Any other non-2xx response; `message` is the server's error text when it sent one. */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
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
  if (res.status === 401 && (body as { code?: string } | undefined)?.code === SIGNIN_REQUIRED) {
    throw new SignInRequiredError((body as { error?: string }).error || "sign in to run programs");
  }
  if (!res.ok) {
    const msg = (body as { error?: string } | undefined)?.error;
    throw new ApiError(msg ? `${msg} (HTTP ${res.status})` : `compile server returned HTTP ${res.status} ${res.statusText}`.trim(), res.status);
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

const postJson = (body: unknown, signal?: AbortSignal): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal,
});

/** Ask the server for an AI completion at the cursor. */
export function completeWithAI(req: CompleteRequest, signal?: AbortSignal): Promise<CompleteResponse> {
  return request<CompleteResponse>("/api/complete", postJson(req, signal));
}

export function getSession(signal?: AbortSignal): Promise<AuthStatus> {
  return request<AuthStatus>("/api/auth/session", { method: "GET", signal });
}

/** `devLink`: the sign-in link itself, from a development server without a mail server. */
export function sendSignInEmail(email: string): Promise<{ ok: true; devLink?: string }> {
  return request("/api/auth/email", postJson({ email }));
}

export async function redeemSignInLink(token: string): Promise<AuthUser> {
  return (await request<{ user: AuthUser }>("/api/auth/email/verify", postJson({ token }))).user;
}

export function signOut(): Promise<{ ok: true }> {
  return request("/api/auth/logout", postJson({}));
}

/** Where to send the browser to sign in with Google; it comes back to `returnTo`. */
export function googleSignInUrl(returnTo = "/#signed-in"): string {
  return `${API_BASE}/api/auth/google?return=${encodeURIComponent(returnTo)}`;
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
