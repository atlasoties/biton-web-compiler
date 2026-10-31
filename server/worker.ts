// Worker: the only process that runs the compiler and user programs.
// It listens on an internal network and accepts jobs from the API server.
//
//   GET  /health   compiler version, sandbox mode, limits, load
//   POST /job      CompileRequest -> CompileResponse   (Authorization: Bearer $WORKER_TOKEN)
//
// Run with: node server/worker.ts

import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";

import type { HealthResponse } from "../shared/api.ts";
import { config } from "./config.ts";
import { BadRequest, compilerVersion, runJob } from "./compiler.ts";
import { clientGone, gracefulShutdown, log, readJson, send, validateRequest } from "./http.ts";
import { BusyError, CancelledError, initSandbox, slots } from "./sandbox.ts";

if (!config.workerToken || config.workerToken.length < 16) {
  console.error("WORKER_TOKEN must be set to a random string of at least 16 characters");
  process.exit(1);
}

let version: string;
try {
  version = compilerVersion();
  for (const note of await initSandbox()) console.log(`  ${note}`);
} catch (e) {
  console.error(`worker: ${(e as Error).message}`);
  process.exit(1);
}
console.log(`biton worker — ${version}`);

const expected = Buffer.from(`Bearer ${config.workerToken}`);
function authorized(header: string | undefined): boolean {
  const got = Buffer.from(header ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://worker");
  try {
    if (url.pathname === "/health" && req.method === "GET") {
      const body: HealthResponse & { load: { busy: number; queued: number; slots: number } } = {
        ok: true,
        compilerVersion: version,
        sandbox: config.sandbox,
        limits: {
          runTimeoutMs: config.runTimeoutMs,
          compileTimeoutMs: config.compileTimeoutMs,
          maxOutputBytes: config.maxOutputBytes,
          maxSourceBytes: config.maxSourceBytes,
        },
        load: { busy: slots.busy, queued: slots.queued, slots: config.maxConcurrent },
      };
      send(res, 200, body);
      return;
    }

    if (url.pathname === "/job" && req.method === "POST") {
      if (!authorized(req.headers.authorization)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      const signal = clientGone(res);
      const job = validateRequest(await readJson(req, config.maxSourceBytes + config.maxStdinBytes + 4096));
      const started = performance.now();
      const result = await runJob(job, signal);
      log({
        event: "job",
        mode: job.mode,
        emit: job.emit,
        ok: result.success,
        failedAt: result.failedAt,
        compileMs: result.compileTimeMs,
        runMs: result.run?.runTimeMs,
        timedOut: result.run?.timedOut,
        totalMs: Math.round(performance.now() - started),
      });
      send(res, 200, result);
      return;
    }

    send(res, 404, { error: "not found" });
  } catch (e) {
    if (e instanceof CancelledError) {
      log({ event: "job_cancelled" });
      res.destroy();
    } else if (e instanceof BadRequest) send(res, 400, { error: e.message });
    else if (e instanceof BusyError) send(res, 503, { error: e.message }, { "Retry-After": "2" });
    else {
      console.error(e);
      send(res, 500, { error: "internal worker error" });
    }
  }
});

server.listen(config.workerPort, config.workerHost, () => {
  console.log(`  listening on http://${config.workerHost}:${config.workerPort}`);
});
gracefulShutdown(server, "worker");
