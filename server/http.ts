// Small HTTP helpers shared by the API server and the worker.

import type { IncomingMessage, ServerResponse } from "node:http";

import { EMIT_KINDS, OPT_LEVELS, type CompileRequest } from "../shared/api.ts";
import { BadRequest } from "./compiler.ts";

export function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

export function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new BadRequest("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function readJson(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const text = await readBody(req, maxBytes);
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequest("body is not valid JSON");
  }
}

/** Validate an untrusted compile request. */
export function validateRequest(body: unknown): CompileRequest {
  if (!body || typeof body !== "object") throw new BadRequest("expected a JSON object");
  const b = body as Record<string, unknown>;
  if (typeof b.code !== "string") throw new BadRequest("`code` must be a string");
  const mode = b.mode ?? "run";
  if (mode !== "run" && mode !== "check" && mode !== "emit") {
    throw new BadRequest("`mode` must be run, check or emit");
  }
  if (mode === "emit" && !EMIT_KINDS.includes(b.emit as never)) {
    throw new BadRequest(`\`emit\` must be one of ${EMIT_KINDS.join(", ")}`);
  }
  if (b.opt !== undefined && !OPT_LEVELS.includes(b.opt as never)) {
    throw new BadRequest(`\`opt\` must be one of ${OPT_LEVELS.join(", ")}`);
  }
  if (b.stdin !== undefined && typeof b.stdin !== "string") throw new BadRequest("`stdin` must be a string");
  return {
    code: b.code,
    mode,
    emit: mode === "emit" ? (b.emit as CompileRequest["emit"]) : undefined,
    opt: b.opt as CompileRequest["opt"],
    stdin: mode === "run" ? (b.stdin as string | undefined) : undefined,
  };
}

/**
 * An AbortSignal that fires when the client goes away before the response
 * is sent. (`req` "close" fires as soon as the body is read, so watch `res`.)
 */
export function clientGone(res: ServerResponse): AbortSignal {
  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) ac.abort();
  });
  return ac.signal;
}

/** Stop accepting connections and wait for in-flight requests on SIGTERM/SIGINT. */
export function gracefulShutdown(server: import("node:http").Server, name: string, graceMs = 30000) {
  let closing = false;
  const stop = (sig: string) => {
    if (closing) return;
    closing = true;
    console.log(`${name}: ${sig} received, finishing in-flight requests`);
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => {
      console.error(`${name}: still busy after ${graceMs} ms, exiting`);
      process.exit(1);
    }, graceMs).unref();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

export function log(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ time: new Date().toISOString(), ...fields }));
}
