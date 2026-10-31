// Run a child process with a timeout, an output cap and cancellation.

import { spawn } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  /** stdout + stderr reached the cap; the process was killed. */
  truncated: boolean;
  /** The AbortSignal fired; the process was killed. */
  aborted: boolean;
  ms: number;
}

export interface ExecOptions {
  cwd: string;
  timeoutMs: number;
  maxOutputBytes: number;
  stdin?: string;
  env: NodeJS.ProcessEnv;
  uid?: number;
  gid?: number;
  signal?: AbortSignal;
}

export function exec(cmd: string, args: string[], opts: ExecOptions): Promise<ExecResult> {
  return new Promise((resolve) => {
    const started = performance.now();
    // detached: the child leads its own process group, so killing the group
    // also kills what it started (the compiler spawns a linker).
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env,
      uid: opts.uid,
      gid: opts.gid,
      detached: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let bytes = 0;
    let truncated = false;
    let timedOut = false;
    let aborted = false;
    let settled = false;

    const killGroup = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    };

    const collect = (sink: Buffer[]) => (chunk: Buffer) => {
      if (truncated) return;
      const room = opts.maxOutputBytes - bytes;
      if (chunk.length > room) {
        sink.push(chunk.subarray(0, Math.max(0, room)));
        bytes = opts.maxOutputBytes;
        truncated = true;
        killGroup();
        return;
      }
      sink.push(chunk);
      bytes += chunk.length;
    };
    child.stdout.on("data", collect(out));
    child.stderr.on("data", collect(err));

    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, opts.timeoutMs);

    const onAbort = () => {
      aborted = true;
      killGroup();
    };
    if (opts.signal?.aborted) onAbort();
    else opts.signal?.addEventListener("abort", onAbort, { once: true });

    const finish = (exitCode: number | null, signal: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      resolve({
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
        exitCode,
        signal,
        timedOut,
        truncated,
        aborted,
        ms: Math.round((performance.now() - started) * 100) / 100,
      });
    };

    child.on("error", (e) => {
      err.push(Buffer.from(`failed to start ${cmd}: ${e.message}\n`));
      finish(null, null);
    });
    child.on("close", (code, signal) => finish(code, signal));

    child.stdin.on("error", () => {
      /* the program exited without reading its input */
    });
    child.stdin.end(opts.stdin ?? "");
  });
}
