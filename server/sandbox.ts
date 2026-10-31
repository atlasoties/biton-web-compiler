// Isolation for compile and run jobs.
//
// Mode "uid" (production, inside the worker container):
//   * the worker starts as root with only CHOWN, DAC_OVERRIDE, FOWNER,
//     SETUID, SETGID and KILL (see docker-compose.yml)
//   * each concurrency slot has its own unprivileged uid; a job runs as
//     its slot's uid, in a 0700 directory, under prlimit (address space,
//     CPU, file size, processes, open files)
//   * after a job, every process of that uid is killed (including any that
//     escaped the process group) and its directory removed
//   * startup refuses to continue if outbound network is reachable
// The container adds a read-only root, a size-limited tmpfs, a pids cgroup
// limit and an internal-only network. Run it under gVisor (runsc) for
// kernel-level isolation.
//
// Mode "none": jobs run as the server's user with time/output limits only.
// Development only; refused when NODE_ENV=production.

import { spawnSync } from "node:child_process";
import { chown, mkdir, readdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import net from "node:net";
import path from "node:path";

import { config } from "./config.ts";

export class BusyError extends Error {}
export class CancelledError extends Error {}

// ── slots ───────────────────────────────────────────────────────────────

/** A fixed number of job slots with a bounded, cancellable wait queue. */
class SlotPool {
  private free: number[];
  private waiting: Array<{ resolve: (slot: number) => void; reject: (e: Error) => void; signal?: AbortSignal; onAbort: () => void }> = [];

  constructor(size: number) {
    this.free = Array.from({ length: size }, (_, i) => i);
  }

  get queued() {
    return this.waiting.length;
  }

  get busy() {
    return config.maxConcurrent - this.free.length;
  }

  acquire(signal?: AbortSignal): Promise<number> {
    if (signal?.aborted) return Promise.reject(new CancelledError("cancelled"));
    const slot = this.free.pop();
    if (slot !== undefined) return Promise.resolve(slot);
    if (this.waiting.length >= config.maxQueue) {
      return Promise.reject(new BusyError("compile server is busy, try again shortly"));
    }
    return new Promise((resolve, reject) => {
      const entry = {
        resolve,
        reject,
        signal,
        onAbort: () => {
          this.waiting = this.waiting.filter((w) => w !== entry);
          reject(new CancelledError("cancelled"));
        },
      };
      signal?.addEventListener("abort", entry.onAbort, { once: true });
      this.waiting.push(entry);
    });
  }

  release(slot: number) {
    const next = this.waiting.shift();
    if (next) {
      next.signal?.removeEventListener("abort", next.onAbort);
      next.resolve(slot);
    } else {
      this.free.push(slot);
    }
  }
}

export const slots = new SlotPool(config.maxConcurrent);

// ── job directories ─────────────────────────────────────────────────────

export interface Job {
  slot: number;
  dir: string;
  /** Set in uid mode. */
  uid?: number;
  gid?: number;
}

const uidFor = (slot: number) => config.jobUidBase + slot;

export async function createJob(slot: number, files: Record<string, string>): Promise<Job> {
  const dir = path.join(config.jobRoot, `${slot}-${randomBytes(6).toString("hex")}`);
  await mkdir(dir, { mode: 0o700 });
  const job: Job = { slot, dir };
  if (config.sandbox === "uid") {
    job.uid = job.gid = uidFor(slot);
  }
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    await writeFile(file, content, { mode: 0o600 });
    if (job.uid !== undefined) await chown(file, job.uid, job.gid!);
  }
  if (job.uid !== undefined) await chown(dir, job.uid, job.gid!);
  return job;
}

/** Kill everything the job left behind and delete its directory. */
export async function destroyJob(job: Job) {
  if (job.uid !== undefined && !(await killUser(job.uid))) {
    // The slot's uid still has live processes that could interfere with the
    // next job. Exit and let the container restart policy give a clean worker.
    console.error(`slot ${job.slot}: processes survived cleanup; restarting the worker`);
    setTimeout(() => process.exit(70), 200);
  }
  await rm(job.dir, { recursive: true, force: true });
}

/**
 * SIGKILL every process whose real uid is `uid`, until none are left.
 * Zombies are not counted as alive, but they still count against the
 * user's RLIMIT_NPROC until reaped, so the worker must run under an init
 * that reaps orphans (`init: true` in docker-compose.yml). Returns false
 * if processes survived.
 */
export async function killUser(uid: number): Promise<boolean> {
  for (let round = 0; round < 100; round++) {
    let found = 0;
    for (const entry of await readdir("/proc")) {
      if (!/^\d+$/.test(entry)) continue;
      let status: string;
      try {
        status = await readFile(`/proc/${entry}/status`, "utf8");
      } catch {
        continue; // exited meanwhile
      }
      const m = /^Uid:\s+(\d+)/m.exec(status);
      const zombie = /^State:\s+[ZX]/m.test(status);
      if (m && Number(m[1]) === uid && !zombie) {
        found++;
        try {
          process.kill(Number(entry), "SIGKILL");
        } catch {
          /* gone */
        }
      }
    }
    if (found === 0) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  console.error(`could not kill all processes of uid ${uid}`);
  return false;
}

// ── command wrapping ────────────────────────────────────────────────────

let hasPrlimit = false;

export interface Limits {
  memoryBytes: number;
  cpuSeconds: number;
  fileSizeBytes: number;
}

/** Wrap `cmd args` in prlimit with the given limits. */
export function limited(cmd: string, args: string[], limits: Limits): [string, string[]] {
  if (!hasPrlimit) return [cmd, args];
  const opts = [
    `--as=${limits.memoryBytes}`,
    `--cpu=${limits.cpuSeconds}`,
    `--fsize=${limits.fileSizeBytes}`,
    "--core=0",
    "--nofile=256",
  ];
  // RLIMIT_NPROC counts every process of the user, so it is only
  // meaningful when the job has a uid of its own.
  if (config.sandbox === "uid") opts.push(`--nproc=${config.jobMaxProcs}`);
  return ["prlimit", [...opts, "--", cmd, ...args]];
}

// ── startup ─────────────────────────────────────────────────────────────

function egressReachable(target: string, timeoutMs = 3000): Promise<boolean> {
  const i = target.lastIndexOf(":");
  const host = target.slice(0, i);
  const port = Number(target.slice(i + 1));
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(timeoutMs, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

/**
 * Verify the configured isolation actually holds. Throws (so the process
 * exits) rather than silently running jobs with less isolation.
 */
export async function initSandbox(): Promise<string[]> {
  const notes: string[] = [];
  hasPrlimit = spawnSync("prlimit", ["--version"]).status === 0;

  if (config.sandbox === "none") {
    if (config.production && !config.allowUnsandboxed) {
      throw new Error(
        "BITON_SANDBOX=none is refused when NODE_ENV=production. Run the worker container (BITON_SANDBOX=uid), " +
          "or set ALLOW_UNSANDBOXED=1 if you really mean it.",
      );
    }
    notes.push("sandbox: NONE — jobs run as this user (development only)");
    if (!hasPrlimit) notes.push("prlimit not found: no memory/CPU limits beyond the timeouts");
  } else {
    if (process.getuid?.() !== 0) {
      throw new Error("BITON_SANDBOX=uid needs the worker to start as root (with CAP_SETUID/CAP_SETGID); see docker-compose.yml");
    }
    if (!hasPrlimit) throw new Error("BITON_SANDBOX=uid needs prlimit (util-linux)");

    // Job users must be able to run programs, and must not be root.
    const probe = spawnSync("id", ["-u"], { uid: uidFor(0), gid: uidFor(0), encoding: "utf8" });
    if (probe.status !== 0 || probe.stdout.trim() !== String(uidFor(0))) {
      throw new Error(`cannot start a process as uid ${uidFor(0)}: ${probe.error?.message ?? probe.stderr}`);
    }

    if (await egressReachable(config.egressProbe)) {
      if (!config.allowEgress) {
        throw new Error(
          `outbound network is reachable (${config.egressProbe}); put the worker on an internal network ` +
            "(see docker-compose.yml) or set ALLOW_EGRESS=1",
        );
      }
      notes.push(`WARNING: outbound network is reachable (${config.egressProbe}); ALLOW_EGRESS=1 is set`);
    }
    notes.push(`sandbox: uid (job uids ${uidFor(0)}–${uidFor(config.maxConcurrent - 1)}, ${config.jobMaxProcs} procs/job)`);
  }

  // Files a job creates in a shared /tmp stay private to its uid.
  process.umask(0o077);

  // Remove directories left by a previous crash, then (re)create the root.
  // (Empty it rather than delete it: in the container it is a tmpfs mount.)
  await mkdir(config.jobRoot, { recursive: true, mode: 0o711 });
  for (const entry of await readdir(config.jobRoot)) {
    await rm(path.join(config.jobRoot, entry), { recursive: true, force: true });
  }
  await chmod(config.jobRoot, 0o711);
  if (config.sandbox === "uid") {
    for (let s = 0; s < config.maxConcurrent; s++) await killUser(uidFor(s));
  }
  return notes;
}
