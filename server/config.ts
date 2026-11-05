// Environment configuration for the API server and the worker.
// Every variable is documented in .env.example.

import path from "node:path";
import { tmpdir } from "node:os";

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 0) throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  return v;
}

function oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!allowed.includes(raw as T)) throw new Error(`${name} must be one of ${allowed.join(", ")}, got "${raw}"`);
  return raw as T;
}

const production = process.env.NODE_ENV === "production";

export const SANDBOX_MODES = ["uid", "none"] as const;
export type SandboxMode = (typeof SANDBOX_MODES)[number];

export const config = {
  production,

  // ── compiler ──
  bitonBin: process.env.BITON_BIN || "biton",
  /** Directory containing the standard library's stdlib/; passed to biton as BITON_SOURCE_DIR. */
  bitonHome: process.env.BITON_HOME || "",
  includeDirs: (process.env.BITON_INCLUDE || "").split(path.delimiter).filter(Boolean),

  // ── isolation ──
  /**
   * uid:  every job runs as its own unprivileged user with rlimits (needs to
   *       start as root with CAP_SETUID/SETGID; meant for the worker container).
   * none: jobs run as the server's user. Development only.
   */
  sandbox: oneOf<SandboxMode>("BITON_SANDBOX", SANDBOX_MODES, production ? "uid" : "none"),
  allowUnsandboxed: process.env.ALLOW_UNSANDBOXED === "1",
  allowEgress: process.env.ALLOW_EGRESS === "1",
  /** host:port that must NOT be reachable from the worker (egress check). */
  egressProbe: process.env.EGRESS_PROBE || "1.1.1.1:443",
  /** First uid/gid of the per-slot job users (slot i runs as JOB_UID_BASE + i). */
  jobUidBase: int("JOB_UID_BASE", 20000),
  jobRoot: process.env.JOB_ROOT || path.join(tmpdir(), "biton-jobs"),

  // ── limits ──
  runTimeoutMs: int("RUN_TIMEOUT_MS", 5000),
  compileTimeoutMs: int("COMPILE_TIMEOUT_MS", 30000),
  runMemoryBytes: int("RUN_MEMORY_MB", 256) * 1024 * 1024,
  compileMemoryBytes: int("COMPILE_MEMORY_MB", 1536) * 1024 * 1024,
  /** Processes + threads per job (uid mode only: RLIMIT_NPROC is per user). */
  jobMaxProcs: int("JOB_MAX_PROCS", 32),
  maxOutputBytes: int("MAX_OUTPUT_BYTES", 256 * 1024),
  maxSourceBytes: int("MAX_SOURCE_BYTES", 128 * 1024),
  maxStdinBytes: int("MAX_STDIN_BYTES", 64 * 1024),
  /** Total size of a multi-file project (the entry plus every other file). */
  maxProjectBytes: int("MAX_PROJECT_BYTES", 512 * 1024),
  maxConcurrent: Math.max(1, int("MAX_CONCURRENT", 2)),
  maxQueue: int("MAX_QUEUE", 32),

  // ── API server ──
  port: int("PORT", 8080),
  host: process.env.HOST || "127.0.0.1",
  corsOrigin: process.env.CORS_ORIGIN || "",
  /** When set, the API forwards jobs to this worker instead of running them itself. */
  workerUrl: (process.env.WORKER_URL || "").replace(/\/+$/, ""),
  workerToken: process.env.WORKER_TOKEN || "",
  cacheBytes: int("CACHE_MB", 64) * 1024 * 1024,

  // ── AI completion (server-side provider proxy) ──
  ai: {
    enabled: process.env.AI_ENABLED === "1",
    /** Any OpenAI-compatible endpoint; the default is Gemini's compatibility API. */
    baseUrl: (process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/+$/, ""),
    apiKey: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || "gemini-2.5-flash",
    maxTokens: Math.max(32, int("AI_MAX_TOKENS", 256)),
    /** Only this much text around the cursor is sent to the provider. */
    maxBefore: Math.max(500, int("AI_MAX_BEFORE", 4000)),
    maxAfter: Math.max(0, int("AI_MAX_AFTER", 2000)),
    timeoutMs: Math.max(1000, int("AI_TIMEOUT_MS", 10_000)),
    /** Default: required in production when running programs also requires sign-in. */
    requireSignIn: process.env.AI_REQUIRE_SIGNIN
      ? process.env.AI_REQUIRE_SIGNIN !== "0"
      : production && process.env.REQUIRE_SIGNIN_TO_RUN !== "0",
  },

  // ── rate limiting (per client IP, API server) ──
  rateLimit: {
    enabled: process.env.RATE_LIMIT !== "off",
    run: { perMinute: Math.max(1, int("RATE_RUN_PER_MIN", 20)), burst: Math.max(1, int("RATE_RUN_BURST", 10)) },
    light: { perMinute: Math.max(1, int("RATE_CHECK_PER_MIN", 120)), burst: Math.max(1, int("RATE_CHECK_BURST", 40)) },
    ai: { perMinute: Math.max(1, int("RATE_AI_PER_MIN", 30)), burst: Math.max(1, int("RATE_AI_BURST", 10)) },
    maxInFlight: Math.max(1, int("RATE_MAX_INFLIGHT", 3)),
    trustProxy: int("TRUST_PROXY", 0),
    maxClients: Math.max(100, int("RATE_MAX_CLIENTS", 100_000)),
  },

  // ── sign-in (API server; see server/auth.ts) ──
  auth: {
    /** HMAC key for sessions and sign-in tokens; required in production. */
    secret: process.env.AUTH_SECRET || "",
    /** Origin the app is served from, e.g. https://biton.example.com. */
    publicUrl: (process.env.PUBLIC_URL || "").replace(/\/+$/, ""),
    requireForRun: process.env.REQUIRE_SIGNIN_TO_RUN !== "0",
    sessionDays: Math.max(1, int("SESSION_DAYS", 30)),
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    /** smtp://user:pass@host:587 or smtps://user:pass@host:465 */
    smtpUrl: process.env.SMTP_URL || "",
    emailFrom: process.env.EMAIL_FROM || "",
    emailsPerIpPerHour: Math.max(1, int("SIGNIN_EMAILS_PER_IP_PER_HOUR", 10)),
    emailsPerAddressPerHour: Math.max(1, int("SIGNIN_EMAILS_PER_ADDRESS_PER_HOUR", 5)),
  },

  // ── worker server ──
  workerPort: int("WORKER_PORT", 9000),
  workerHost: process.env.WORKER_HOST || "127.0.0.1",
};

export type Config = typeof config;
