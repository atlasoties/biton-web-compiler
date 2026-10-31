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
  /** Directory containing the stdlib's lib/; passed to biton as BITON_SOURCE_DIR. */
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

  // ── rate limiting (per client IP, API server) ──
  rateLimit: {
    enabled: process.env.RATE_LIMIT !== "off",
    run: { perMinute: Math.max(1, int("RATE_RUN_PER_MIN", 20)), burst: Math.max(1, int("RATE_RUN_BURST", 10)) },
    light: { perMinute: Math.max(1, int("RATE_CHECK_PER_MIN", 120)), burst: Math.max(1, int("RATE_CHECK_BURST", 40)) },
    maxInFlight: Math.max(1, int("RATE_MAX_INFLIGHT", 3)),
    trustProxy: int("TRUST_PROXY", 0),
    maxClients: Math.max(100, int("RATE_MAX_CLIENTS", 100_000)),
  },

  // ── worker server ──
  workerPort: int("WORKER_PORT", 9000),
  workerHost: process.env.WORKER_HOST || "127.0.0.1",
};

export type Config = typeof config;
