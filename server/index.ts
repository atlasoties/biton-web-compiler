// Public HTTP API for the Biton web compiler.
//
//   GET  /api/health   compiler version, sandbox mode and limits
//   POST /api/compile  { code, mode: "run" | "check" | "emit" | "format", emit?, opt?, stdin?, args? }
//   /api/auth/*        sign-in (server/auth.ts); runs need a signed-in user
//                      unless REQUIRE_SIGNIN_TO_RUN=0
//   GET  /healthz      liveness
//   GET  /readyz       readiness (the compiler/worker is reachable)
//
// In production the API never runs user code itself: with WORKER_URL set it
// forwards jobs to the worker (server/worker.ts) on an internal network.
// Without WORKER_URL it runs jobs in-process, which is meant for development.
// When dist/ exists the server also serves the built frontend.
//
// Run with: node server/index.ts   (Node 22.18+ strips the TypeScript types)

import { createServer, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { randomBytes } from "node:crypto";

import {
  MAX_ARG_BYTES,
  MAX_ARGS,
  SIGNIN_REQUIRED,
  type CompileRequest,
  type CompileResponse,
  type HealthResponse,
} from "../shared/api.ts";
import { AuthError, createAuth, mailerFromEnv, type Auth } from "./auth.ts";
import { ResultCache } from "./cache.ts";
import { config } from "./config.ts";
import { BadRequest } from "./compiler.ts";
import { clientGone, gracefulShutdown, log, readJson, send, validateRequest } from "./http.ts";
import { BusyError, CancelledError } from "./sandbox.ts";
import { RateLimiter, addressKey, clientAddress, rateLimitHeaders } from "./ratelimit.ts";

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const MAX_BODY_BYTES = config.maxSourceBytes + config.maxStdinBytes + MAX_ARGS * (MAX_ARG_BYTES + 8) + 4096;

class UpstreamError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// ── backend: remote worker or in-process ────────────────────────────────

interface Backend {
  describe: string;
  health(): Promise<HealthResponse>;
  run(req: CompileRequest, signal: AbortSignal): Promise<CompileResponse>;
}

function remoteBackend(): Backend {
  if (!config.workerToken) throw new Error("WORKER_URL is set but WORKER_TOKEN is not");
  const auth = { Authorization: `Bearer ${config.workerToken}` };
  return {
    describe: `worker at ${config.workerUrl}`,
    async health() {
      const res = await fetch(`${config.workerUrl}/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`worker health returned HTTP ${res.status}`);
      return (await res.json()) as HealthResponse;
    },
    async run(req, signal) {
      let res: Response;
      try {
        res = await fetch(`${config.workerUrl}/job`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...auth },
          body: JSON.stringify(req),
          // Aborting the fetch closes the connection, which cancels the job.
          signal,
        });
      } catch (e) {
        if (signal.aborted) throw new CancelledError("cancelled");
        throw new UpstreamError(`worker unreachable: ${(e as Error).message}`, 502);
      }
      const body = (await res.json().catch(() => ({}))) as CompileResponse & { error?: string };
      if (res.status === 400) throw new BadRequest(body.error || "bad request");
      if (res.status === 503) throw new BusyError(body.error || "compile server is busy");
      if (!res.ok) throw new UpstreamError(`worker returned HTTP ${res.status}: ${body.error ?? ""}`.trim(), 502);
      return body;
    },
  };
}

async function localBackend(): Promise<Backend> {
  const { compilerVersion, publicLimits, runJob } = await import("./compiler.ts");
  const { initSandbox } = await import("./sandbox.ts");
  for (const note of await initSandbox()) console.log(`  ${note}`);
  const version = compilerVersion();
  return {
    describe: `in-process (${config.bitonBin})`,
    async health() {
      return {
        ok: true,
        compilerVersion: version,
        sandbox: config.sandbox,
        limits: publicLimits(),
      };
    },
    run: runJob,
  };
}

let backend: Backend;
try {
  if (config.production && !config.workerUrl && !config.allowUnsandboxed && config.sandbox === "none") {
    throw new Error("NODE_ENV=production without WORKER_URL: set WORKER_URL to the worker (see docker-compose.yml)");
  }
  backend = config.workerUrl ? remoteBackend() : await localBackend();
} catch (e) {
  console.error(`api: ${(e as Error).message}`);
  process.exit(1);
}
console.log(`biton web API — backend: ${backend.describe}`);

// The compiler version is part of the cache key and the health response.
// With a remote worker it may not be up yet, so keep polling until it is.
let workerHealth: HealthResponse | null = null;
async function refreshHealth(): Promise<HealthResponse | null> {
  try {
    workerHealth = await backend.health();
  } catch (e) {
    if (workerHealth) console.error(`worker health check failed: ${(e as Error).message}`);
    workerHealth = null;
  }
  return workerHealth;
}
await refreshHealth();
setInterval(refreshHealth, 15000).unref();

const cache = new ResultCache(config.cacheBytes);
const limiter = new RateLimiter(config.rateLimit);
setInterval(() => limiter.sweep(), 60_000).unref();
if (config.rateLimit.enabled) {
  const { run, light, maxInFlight, trustProxy } = config.rateLimit;
  console.log(
    `  rate limit: runs ${run.perMinute}/min (burst ${run.burst}), checks ${light.perMinute}/min (burst ${light.burst}), ` +
      `${maxInFlight} concurrent per client, trusting ${trustProxy} proxy hop(s)`,
  );
} else {
  console.warn("  rate limit: OFF");
}

// ── sign-in ─────────────────────────────────────────────────────────────

async function setupAuth(): Promise<Auth> {
  const a = config.auth;
  let secret = a.secret;
  if (!secret) {
    if (config.production) throw new Error("AUTH_SECRET must be set (openssl rand -hex 32)");
    secret = randomBytes(32).toString("hex");
    console.warn("  AUTH_SECRET is not set: using a random one, so sessions end when the server restarts");
  }
  if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters (openssl rand -hex 32)");
  let publicUrl = a.publicUrl;
  if (publicUrl) {
    const u = new URL(publicUrl);
    if (u.origin !== publicUrl) throw new Error(`PUBLIC_URL must be an origin only (scheme://host[:port]), got "${publicUrl}"`);
    if (config.production && u.protocol !== "https:") console.warn("  PUBLIC_URL is not https: session cookies are not Secure");
  } else if (config.production) {
    throw new Error("PUBLIC_URL must be set to the address users open, e.g. https://biton.example.com");
  }
  if (!!a.googleClientId !== !!a.googleClientSecret) throw new Error("set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither");
  const mailer = await mailerFromEnv({ smtpUrl: a.smtpUrl, from: a.emailFrom, production: config.production });
  const google = a.googleClientId ? { clientId: a.googleClientId, clientSecret: a.googleClientSecret } : undefined;
  if (a.requireForRun && !google && !mailer) {
    throw new Error(
      "REQUIRE_SIGNIN_TO_RUN is on but no sign-in method is configured: set GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET " +
        "and/or SMTP_URL/EMAIL_FROM, or REQUIRE_SIGNIN_TO_RUN=0",
    );
  }
  if (config.corsOrigin && a.requireForRun) {
    console.warn("  CORS_ORIGIN is set: sign-in cookies only work when the frontend is served from the API's own origin");
  }
  return createAuth({
    secret,
    publicUrl,
    requireForRun: a.requireForRun,
    sessionDays: a.sessionDays,
    google,
    mailer,
    secureCookies: publicUrl.startsWith("https://"),
    emailsPerIpPerHour: a.emailsPerIpPerHour,
    emailsPerAddressPerHour: a.emailsPerAddressPerHour,
    clientKey: (req) => addressKey(clientAddress(req, config.rateLimit.trustProxy)),
    log,
  });
}

let auth: Auth;
try {
  auth = await setupAuth();
} catch (e) {
  console.error(`api: ${(e as Error).message}`);
  process.exit(1);
}
for (const line of auth.describe()) console.log(`  ${line}`);

// ── static files ────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

async function serveStatic(urlPath: string, res: ServerResponse): Promise<boolean> {
  let file = path.join(DIST, path.normalize(decodeURIComponent(urlPath)));
  if (!file.startsWith(DIST + path.sep) && file !== DIST) return false;
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = path.join(file, "index.html");
  } catch {
    file = path.join(DIST, "index.html"); // SPA fallback
  }
  try {
    const data = await readFile(file);
    const immutable = file.includes(`${path.sep}assets${path.sep}`);
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      ...SECURITY_HEADERS,
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

// ── routes ──────────────────────────────────────────────────────────────

let warnedXff = false;

async function handleCompile(req: import("node:http").IncomingMessage, res: ServerResponse) {
  const signal = clientGone(res);
  const job = validateRequest(await readJson(req, MAX_BODY_BYTES));
  if (Buffer.byteLength(job.code, "utf8") > config.maxSourceBytes) {
    throw new BadRequest(`source is larger than ${config.maxSourceBytes} bytes`);
  }
  const user = auth.user(req);
  // A request that carries a session must come from the app's own pages.
  if (user) auth.checkOrigin(req);
  if (job.mode === "run" && auth.requireForRun && !user) {
    send(res, 401, { error: "sign in to run programs", code: SIGNIN_REQUIRED });
    return;
  }

  const version = workerHealth?.compilerVersion;
  const key = version && ResultCache.cacheable(job) ? ResultCache.key(version, job) : null;
  if (key) {
    const hit = cache.get(key);
    if (hit) {
      send(res, 200, { ...hit, cached: true });
      return;
    }
  }

  // Cache hits above are free; everything that reaches the worker is limited.
  if (config.rateLimit.trustProxy === 0 && req.headers["x-forwarded-for"] && !warnedXff) {
    warnedXff = true;
    console.warn(
      "requests carry X-Forwarded-For but TRUST_PROXY=0: every client behind the proxy shares one rate limit. " +
        "Set TRUST_PROXY to the number of proxies in front of this server.",
    );
  }
  // Signed-in users have their own budget wherever they connect from.
  const client = user ? `user:${user.id}` : addressKey(clientAddress(req, config.rateLimit.trustProxy));
  const decision = limiter.acquire(client, job.mode === "run" ? "run" : "light");
  const headers = rateLimitHeaders(decision);
  if (!decision.allowed) {
    log({ event: "rate_limited", client, mode: job.mode, reason: decision.reason });
    send(
      res,
      429,
      {
        error:
          decision.reason === "concurrency"
            ? "too many requests at once; wait for the previous one to finish"
            : `rate limit reached; try again in ${decision.retryAfter} s`,
        retryAfter: decision.retryAfter,
      },
      headers,
    );
    return;
  }

  const started = performance.now();
  try {
    const result = await backend.run(job, signal);
    // Cache successful and failed checks alike; skip compiler timeouts and kills.
    if (key && !/timed out|killed by/.test(result.compilerOutput)) cache.set(key, result);
    log({ event: "compile", mode: job.mode, ok: result.success, user: user?.id, ms: Math.round(performance.now() - started) });
    send(res, 200, result, headers);
  } catch (e) {
    if (e instanceof CancelledError || signal.aborted) {
      log({ event: "compile_cancelled", mode: job.mode, ms: Math.round(performance.now() - started) });
      return; // the client is gone; nothing to send
    }
    throw e;
  } finally {
    limiter.release(client);
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://localhost");

  if (config.corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", config.corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "Retry-After, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset");
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  try {
    if (await auth.handle(req, res, url)) return;
    switch (url.pathname) {
      case "/healthz":
        send(res, 200, { ok: true });
        return;
      case "/readyz": {
        const h = workerHealth ?? (await refreshHealth());
        send(res, h ? 200 : 503, { ok: !!h });
        return;
      }
      case "/api/health": {
        const h = workerHealth ?? (await refreshHealth());
        if (!h) {
          send(res, 503, { error: "compile worker is not reachable" });
          return;
        }
        const { ok, compilerVersion, sandbox, limits } = h;
        send(res, 200, { ok, compilerVersion, sandbox, limits } satisfies HealthResponse);
        return;
      }
      case "/api/compile":
        if (req.method !== "POST") {
          send(res, 405, { error: "use POST" });
          return;
        }
        await handleCompile(req, res);
        return;
    }

    if (url.pathname.startsWith("/api/")) {
      send(res, 404, { error: "not found" });
      return;
    }
    if ((req.method === "GET" || req.method === "HEAD") && (await serveStatic(url.pathname, res))) return;
    send(res, 404, { error: "not found (run `npm run build` to serve the frontend from this server)" });
  } catch (e) {
    if (e instanceof BadRequest) send(res, 400, { error: e.message });
    else if (e instanceof AuthError) send(res, e.status, { error: e.message });
    else if (e instanceof BusyError) send(res, 503, { error: e.message }, { "Retry-After": "2" });
    else if (e instanceof UpstreamError) {
      console.error(e.message);
      send(res, e.status, { error: "compile worker is unavailable" });
    } else {
      console.error(e);
      send(res, 500, { error: "internal server error" });
    }
  }
});

server.listen(config.port, config.host, () => {
  console.log(`  listening on http://${config.host}:${config.port}`);
});
gracefulShutdown(server, "api");
