// Compile, check, emit, format and run Biton programs with the real compiler.
// Both the compiler and the program run inside the job sandbox.

import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_ENTRY, type CompileRequest, type CompileResponse, type HealthResponse, type RunResult } from "../shared/api.ts";
import { config } from "./config.ts";
import { parseDiagnostics } from "./diagnostics.ts";
import { exec } from "./exec.ts";
import { CancelledError, createJob, destroyJob, limited, slots, type Job } from "./sandbox.ts";

const PROGRAM_NAME = "prog";
const entryOf = (req: CompileRequest) => req.entry ?? DEFAULT_ENTRY;

export class BadRequest extends Error {}

export function compilerVersion(): string {
  const r = spawnSync(config.bitonBin, ["--version"], { timeout: 5000, encoding: "utf8", env: compilerEnv("/") });
  if (r.status !== 0) {
    throw new Error(`cannot run ${config.bitonBin} --version: ${r.stderr?.trim() || r.error?.message}`);
  }
  return r.stdout.trim();
}

/** The limits clients are told about in the health response. */
export function publicLimits(): HealthResponse["limits"] {
  return {
    runTimeoutMs: config.runTimeoutMs,
    compileTimeoutMs: config.compileTimeoutMs,
    maxOutputBytes: config.maxOutputBytes,
    maxSourceBytes: config.maxSourceBytes,
    maxStdinBytes: config.maxStdinBytes,
    maxProjectBytes: config.maxProjectBytes,
  };
}

function compilerEnv(dir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: dir,
    TMPDIR: dir,
    LANG: "C.UTF-8",
  };
  if (config.bitonHome) env.BITON_SOURCE_DIR = config.bitonHome;
  // The compiler finds its standard library in $BITON_SOURCE_DIR/stdlib.
  // Lets a sanitizer build of the compiler be used in development.
  if (process.env.ASAN_OPTIONS) env.ASAN_OPTIONS = process.env.ASAN_OPTIONS;
  return env;
}

export function validateSize(req: CompileRequest) {
  if (Buffer.byteLength(req.code, "utf8") > config.maxSourceBytes) {
    throw new BadRequest(`source is larger than ${config.maxSourceBytes} bytes`);
  }
  if (req.stdin && Buffer.byteLength(req.stdin, "utf8") > config.maxStdinBytes) {
    throw new BadRequest(`stdin is larger than ${config.maxStdinBytes} bytes`);
  }
  let total = Buffer.byteLength(req.code, "utf8");
  for (const content of Object.values(req.files ?? {})) total += Buffer.byteLength(content, "utf8");
  if (total > config.maxProjectBytes) {
    throw new BadRequest(`the project is larger than ${config.maxProjectBytes} bytes`);
  }
}

/** Run one request in a free slot. Throws CancelledError when `signal` fires. */
export async function runJob(req: CompileRequest, signal?: AbortSignal): Promise<CompileResponse> {
  validateSize(req);
  const slot = await slots.acquire(signal);
  let job: Job | null = null;
  try {
    // validateRequest has checked every path; the entry always wins over a
    // stale copy of itself in `files`.
    const files: Record<string, string> = { ...req.files, [entryOf(req)]: req.code };
    job = await createJob(slot, files);
    return await compileAndRun(job, req, signal);
  } finally {
    if (job) await destroyJob(job).catch((e) => console.error("job cleanup failed:", e));
    slots.release(slot);
  }
}

async function compileAndRun(job: Job, req: CompileRequest, signal?: AbortSignal): Promise<CompileResponse> {
  if (req.mode === "format") return format(job, entryOf(req), signal);
  const args = ["--no-color"];
  for (const inc of config.includeDirs) args.push("-I", inc);
  if (req.mode === "run" || (req.mode === "emit" && req.emit === "ir")) args.push(`-${req.opt ?? "O2"}`);
  if (req.mode === "check") args.push("--check");
  if (req.mode === "emit") args.push("--emit", req.emit!);
  if (req.mode === "run") args.push("-o", PROGRAM_NAME);
  args.push(entryOf(req));

  const c = await runCompiler(job, args, signal);
  const { diagnostics, other } = parseDiagnostics(c.stderr);
  const compilerOutput = compilerNote(c) + other;
  const compiled = c.exitCode === 0 && !c.timedOut;

  const response: CompileResponse = {
    success: compiled,
    mode: req.mode,
    failedAt: compiled ? null : "compile",
    diagnostics,
    compilerOutput: compilerOutput.trim(),
    compileTimeMs: c.ms,
  };
  if (req.mode === "emit") response.emitted = c.stdout;
  if (!compiled || req.mode !== "run") return response;

  response.run = await runProgram(job, req.stdin, req.args ?? [], signal);
  // A non-zero exit code is a legitimate result in Biton (`main`'s return
  // value), so only crashes, kills and timeouts count as a failed run.
  if (response.run.timedOut || response.run.signal) {
    response.success = false;
    response.failedAt = "run";
  }
  return response;
}

/** Run the compiler in the job; its stderr has the job directory removed from paths. */
async function runCompiler(job: Job, args: string[], signal?: AbortSignal) {
  const [cmd, cmdArgs] = limited(config.bitonBin, args, {
    memoryBytes: config.compileMemoryBytes,
    cpuSeconds: Math.ceil(config.compileTimeoutMs / 1000) + 1,
    fileSizeBytes: 64 * 1024 * 1024,
  });
  const c = await exec(cmd, cmdArgs, {
    cwd: job.dir,
    env: compilerEnv(job.dir),
    uid: job.uid,
    gid: job.gid,
    timeoutMs: config.compileTimeoutMs,
    maxOutputBytes: 4 * 1024 * 1024,
    signal,
  });
  if (c.aborted) throw new CancelledError("cancelled");
  // Show the buffer as "main.bit" rather than the job directory.
  c.stderr = c.stderr.split(job.dir + path.sep).join("");
  c.stdout = c.stdout.split(job.dir + path.sep).join("");
  return c;
}

function compilerNote(c: { timedOut: boolean; signal: string | null }): string {
  if (c.timedOut) return `compiler timed out after ${config.compileTimeoutMs} ms\n`;
  if (c.signal) return `compiler was killed by ${c.signal} (resource limit?)\n`;
  return "";
}

/**
 * `biton fmt main.bit`, which formats the file in place. It leaves a file
 * it cannot format (one that does not parse) as it was, so `formatted`
 * is then the input.
 */
async function format(job: Job, entry: string, signal?: AbortSignal): Promise<CompileResponse> {
  const c = await runCompiler(job, ["fmt", entry], signal);
  const ok = c.exitCode === 0 && !c.timedOut;
  const { diagnostics, other } = parseDiagnostics(c.stderr);
  const response: CompileResponse = {
    success: ok,
    mode: "format",
    failedAt: ok ? null : "compile",
    diagnostics,
    compilerOutput: (compilerNote(c) + other).trim(),
    compileTimeMs: c.ms,
  };
  if (ok) response.formatted = await readFile(path.join(job.dir, entry), "utf8");
  return response;
}

async function runProgram(job: Job, stdin: string | undefined, programArgs: string[], signal?: AbortSignal): Promise<RunResult> {
  const [cmd, args] = limited(path.join(job.dir, PROGRAM_NAME), programArgs, {
    memoryBytes: config.runMemoryBytes,
    cpuSeconds: Math.ceil(config.runTimeoutMs / 1000) + 1,
    fileSizeBytes: config.maxOutputBytes,
  });
  const r = await exec(cmd, args, {
    cwd: job.dir,
    env: { PATH: "/usr/bin:/bin", HOME: job.dir, TMPDIR: job.dir, LANG: "C.UTF-8" },
    uid: job.uid,
    gid: job.gid,
    timeoutMs: config.runTimeoutMs,
    maxOutputBytes: config.maxOutputBytes,
    stdin,
    signal,
  });
  if (r.aborted) throw new CancelledError("cancelled");
  return {
    stdout: r.stdout,
    stderr: r.stderr,
    exitCode: r.exitCode,
    signal: r.signal,
    timedOut: r.timedOut,
    truncated: r.truncated,
    runTimeMs: r.ms,
  };
}
