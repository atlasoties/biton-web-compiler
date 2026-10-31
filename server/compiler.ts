// Compile, check, emit and run Biton programs with the real compiler.
// Both the compiler and the program run inside the job sandbox.

import { spawnSync } from "node:child_process";
import path from "node:path";

import type { CompileRequest, CompileResponse, RunResult } from "../shared/api.ts";
import { config } from "./config.ts";
import { parseDiagnostics } from "./diagnostics.ts";
import { exec } from "./exec.ts";
import { CancelledError, createJob, destroyJob, limited, slots, type Job } from "./sandbox.ts";

const SOURCE_NAME = "main.bit";
const PROGRAM_NAME = "prog";

export class BadRequest extends Error {}

export function compilerVersion(): string {
  const r = spawnSync(config.bitonBin, ["--version"], { timeout: 5000, encoding: "utf8", env: compilerEnv("/") });
  if (r.status !== 0) {
    throw new Error(`cannot run ${config.bitonBin} --version: ${r.stderr?.trim() || r.error?.message}`);
  }
  return r.stdout.trim();
}

function compilerEnv(dir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
    HOME: dir,
    TMPDIR: dir,
    LANG: "C.UTF-8",
  };
  if (config.bitonHome) env.BITON_SOURCE_DIR = config.bitonHome;
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
}

/** Run one request in a free slot. Throws CancelledError when `signal` fires. */
export async function runJob(req: CompileRequest, signal?: AbortSignal): Promise<CompileResponse> {
  validateSize(req);
  const slot = await slots.acquire(signal);
  let job: Job | null = null;
  try {
    job = await createJob(slot, { [SOURCE_NAME]: req.code });
    return await compileAndRun(job, req, signal);
  } finally {
    if (job) await destroyJob(job).catch((e) => console.error("job cleanup failed:", e));
    slots.release(slot);
  }
}

async function compileAndRun(job: Job, req: CompileRequest, signal?: AbortSignal): Promise<CompileResponse> {
  const args = ["--no-color"];
  for (const inc of config.includeDirs) args.push("-I", inc);
  if (req.mode === "run" || (req.mode === "emit" && req.emit === "ir")) args.push(`-${req.opt ?? "O2"}`);
  if (req.mode === "check") args.push("--check");
  if (req.mode === "emit") args.push("--emit", req.emit!);
  if (req.mode === "run") args.push("-o", PROGRAM_NAME);
  args.push(SOURCE_NAME);

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
  const stderr = c.stderr.split(job.dir + path.sep).join("");
  const { diagnostics, other } = parseDiagnostics(stderr);
  let compilerOutput = other;
  if (c.timedOut) compilerOutput = `compiler timed out after ${config.compileTimeoutMs} ms\n${compilerOutput}`;
  else if (c.signal) compilerOutput = `compiler was killed by ${c.signal} (resource limit?)\n${compilerOutput}`;
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

  response.run = await runProgram(job, req.stdin, signal);
  // A non-zero exit code is a legitimate result in Biton (`main`'s return
  // value), so only crashes, kills and timeouts count as a failed run.
  if (response.run.timedOut || response.run.signal) {
    response.success = false;
    response.failedAt = "run";
  }
  return response;
}

async function runProgram(job: Job, stdin: string | undefined, signal?: AbortSignal): Promise<RunResult> {
  const [cmd, args] = limited(path.join(job.dir, PROGRAM_NAME), [], {
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
