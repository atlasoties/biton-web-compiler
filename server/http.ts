// Small HTTP helpers shared by the API server and the worker.

import type { IncomingMessage, ServerResponse } from "node:http";

import {
  COMPILE_MODES,
  EMIT_KINDS,
  MAX_ARG_BYTES,
  MAX_ARGS,
  MAX_PROJECT_FILES,
  OPT_LEVELS,
  projectPathProblem,
  type CompileRequest,
} from "../shared/api.ts";
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
  const mode = (b.mode ?? "run") as CompileRequest["mode"];
  if (!COMPILE_MODES.includes(mode)) {
    throw new BadRequest(`\`mode\` must be one of ${COMPILE_MODES.join(", ")}`);
  }
  if (mode === "emit" && !EMIT_KINDS.includes(b.emit as never)) {
    throw new BadRequest(`\`emit\` must be one of ${EMIT_KINDS.join(", ")}`);
  }
  if (b.opt !== undefined && !OPT_LEVELS.includes(b.opt as never)) {
    throw new BadRequest(`\`opt\` must be one of ${OPT_LEVELS.join(", ")}`);
  }
  if (b.stdin !== undefined && typeof b.stdin !== "string") throw new BadRequest("`stdin` must be a string");
  if (b.args !== undefined) {
    if (!Array.isArray(b.args) || !b.args.every((a) => typeof a === "string")) {
      throw new BadRequest("`args` must be an array of strings");
    }
    if (b.args.length > MAX_ARGS) throw new BadRequest(`at most ${MAX_ARGS} arguments`);
    for (const a of b.args as string[]) {
      if (a.includes("\0")) throw new BadRequest("an argument cannot contain a NUL character");
      if (Buffer.byteLength(a, "utf8") > MAX_ARG_BYTES) throw new BadRequest(`an argument is longer than ${MAX_ARG_BYTES} bytes`);
    }
  }
  let entry: string | undefined;
  if (b.entry !== undefined) {
    if (typeof b.entry !== "string") throw new BadRequest("`entry` must be a string");
    const problem = projectPathProblem(b.entry);
    if (problem) throw new BadRequest(`\`entry\` ${JSON.stringify(b.entry)}: ${problem}`);
    entry = b.entry;
  }
  let files: Record<string, string> | undefined;
  if (b.files !== undefined) {
    if (!b.files || typeof b.files !== "object" || Array.isArray(b.files)) throw new BadRequest("`files` must be an object of path → text");
    const entries = Object.entries(b.files as Record<string, unknown>);
    if (entries.length > MAX_PROJECT_FILES) throw new BadRequest(`at most ${MAX_PROJECT_FILES} files`);
    files = {};
    const seen = new Set<string>();
    for (const [name, content] of entries) {
      const problem = projectPathProblem(name);
      if (problem) throw new BadRequest(`file ${JSON.stringify(name.slice(0, 80))}: ${problem}`);
      if (typeof content !== "string") throw new BadRequest(`file ${JSON.stringify(name)} must be text`);
      seen.add(name);
      files[name] = content;
    }
    // "a" and "a/b.bit" cannot both exist: one would have to be a file and a folder.
    for (const name of seen) {
      for (let i = name.indexOf("/"); i !== -1; i = name.indexOf("/", i + 1)) {
        if (seen.has(name.slice(0, i)) || name.slice(0, i) === entry) {
          throw new BadRequest(`${JSON.stringify(name.slice(0, i))} is both a file and a folder`);
        }
      }
    }
    if (entry && [...seen].some((n) => entry!.startsWith(n + "/"))) {
      throw new BadRequest("`entry` is inside a path that is also a file");
    }
    if (entries.length === 0) files = undefined;
  }
  return {
    code: b.code,
    mode,
    entry,
    files,
    emit: mode === "emit" ? (b.emit as CompileRequest["emit"]) : undefined,
    opt: b.opt as CompileRequest["opt"],
    stdin: mode === "run" ? (b.stdin as string | undefined) : undefined,
    args: mode === "run" && (b.args as string[] | undefined)?.length ? (b.args as string[]) : undefined,
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
