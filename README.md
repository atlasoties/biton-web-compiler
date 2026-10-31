# Biton Web Compiler

A browser IDE for [Biton](../biton), a small, statically-typed systems
language with an LLVM backend. Nothing is reimplemented here: the editor
sends code to a small server that runs the real `biton` compiler, executes
the native program with limits, and returns its output and diagnostics.

```
browser (React)  ──POST /api/compile──▶  server/ (Node)  ──▶  biton --no-color -O2 -o prog main.bit
      ▲                                       │               ./prog   (timeout, memory cap, sandbox)
      └──────── diagnostics, stdout, exit code, --emit output ◀┘
```

## Features

- **Real compilation**: compiled with `biton` at `-O0`–`-O3` and run natively. `main`'s return value is the exit code.
- **Live diagnostics**: `biton --check` runs as you type. Errors and warnings show their code, `note`/`help` lines, gutter and line markers, and clicking one jumps to its location.
- **Pipeline inspector**: the output of every compiler stage (`--emit tokens | ast | hir | typed-hir | mir | ir`).
- **Examples**: seven programs in real Biton syntax, all verified against biton 1.0.0-beta: basics, arrays and slices, kinds and `impl`, enums/unions/`when`, generics and lambdas, pointers/`unsafe`/`defer`, and ownership with `std::box`.
- **Language and stdlib reference** in the sidebar, taken from `../biton/README.md`, `grammar/biton.bnf` and `lib/*.bit`.
- **Terminal**: `run`, `check`, `emit <kind>`, `opt <O0..O3>`, `version`, `clear`, `help`. Ctrl+Enter runs.

## Run locally (development)

Prerequisites: Node.js 22.18+ and a built `biton` compiler (see `../biton/README.md`).

```bash
npm install
BITON_BIN=../biton/build/cli/biton npm run server   # API on :8080, runs jobs in-process, unsandboxed
npm run dev                                          # UI on :5173, /api proxied to :8080
```

Development mode runs programs as your own user with only time and output
limits. Don't expose it.

## Deploy (production)

```
internet ──TLS proxy──▶ web :8080 ──(internal network)──▶ worker :9000
                         API + frontend                   compiler + programs
                         never runs user code             no internet access
```

```bash
scripts/stage-compiler.sh ../biton                   # copy the built compiler + stdlib into vendor/
echo "WORKER_TOKEN=$(openssl rand -hex 32)" > .env
docker compose up -d --build
scripts/security-check.sh http://127.0.0.1:8080      # 15 hostile-program checks; all must PASS
```

Put a TLS-terminating proxy (Caddy, nginx, a cloud load balancer) in front
of the `web` service, and set `TRUST_PROXY` to the number of proxies (usually
`1`) so rate limits apply per user rather than to the proxy's address. All settings are documented in [`.env.example`](.env.example).

## Security model

Users can call any libc function from Biton (`~>extern("C") def system(...)`),
so the worker treats every job as hostile code.

| Layer | What it does |
|---|---|
| **Separate worker** | Only the `worker` container runs the compiler and programs. The public `web` container just validates, caches and forwards. Worker requests need `WORKER_TOKEN`. |
| **No network** | The worker is attached only to an `internal: true` network. On startup it refuses to run if `EGRESS_PROBE` is reachable. |
| **One uid per job** | Each concurrency slot has its own unprivileged uid (`JOB_UID_BASE+i`). Jobs run in a `0700` directory that other jobs can't read. Processes running as another uid can't signal or ptrace them, or read the token from `/proc`. |
| **Compiler sandboxed too** | Compilation runs as the job's uid with the same limits as the program. |
| **Resource limits** | `prlimit` on every job: address space, CPU seconds, file size, open files, **processes per job** (stops fork bombs). Wall-clock timeouts and an output cap apply on top. The container adds memory, CPU and pids cgroup limits. |
| **Cleanup** | After each job, every process of that uid is killed, including any that escaped with `setsid`, and its directory is deleted. If a process survives, the worker exits and Docker restarts it clean. `tini` (`init: true`) reaps orphans. |
| **Container hardening** | Read-only root filesystem, `tmpfs` work dirs, `no-new-privileges`, and every capability dropped except CHOWN, DAC_OVERRIDE, FOWNER, SETUID, SETGID and KILL. |
| **Refuses weak setups** | With `NODE_ENV=production`: no in-process execution without a worker, no `BITON_SANDBOX=none`, no worker that isn't root-capable or that can reach the internet. Each can be overridden only with an explicit `ALLOW_*` variable. |

For kernel-level isolation, install [gVisor](https://gvisor.dev) and set
`WORKER_RUNTIME=runsc`. Jobs share the host kernel otherwise.

**Cancellation:** when a browser aborts a request (a newer keystroke, a
newer run), the API closes its connection to the worker. The worker then
kills the job, or drops it from the queue if it hasn't started.

**Rate limiting** (per client IP, IPv6 per /64; settings in `.env.example`):

| Budget | Default | Applies to |
|---|---|---|
| Runs | 20/min, burst 10 | `mode: "run"` |
| Checks | 120/min, burst 40 | `check` and `emit`. Cache hits are free, so the live check rarely uses it. |
| Concurrency | 3 jobs per client | everything that reaches the worker |

Refusals are HTTP 429 with `Retry-After` and `RateLimit-*` headers. The
editor backs off on its own: the live check retries silently, and a run
retries once after a short refusal. Limits are kept in memory per API
instance; with several replicas, also limit at the load balancer. The worker's
queue (`MAX_QUEUE`) is the global backstop.

**Caching:** type checks and `--emit` output are cached in the API, in
memory (`CACHE_MB`), keyed by compiler version and source. Program runs are
never cached.

## API

`POST /api/compile`

```jsonc
{ "code": "def main() => int { give 42; }",
  "mode": "run",          // "run" | "check" | "emit"
  "emit": "ir",           // with mode "emit": tokens | ast | hir | typed-hir | mir | ir
  "opt": "O2",            // O0 | O1 | O2 | O3
  "stdin": "" }           // optional program input
```

The response (types in [`shared/api.ts`](shared/api.ts)) has `success`,
`failedAt` (`"compile"` / `"run"` / `null`), and `diagnostics[]`. Each
diagnostic has `severity`, `code`, `message`, `file`, `line`, `col`,
`endCol`, `notes`, and `rendered` (the exact compiler text). The response
also has `compilerOutput` (anything that isn't a diagnostic, such as linker
errors), `compileTimeMs`, `emitted` for `emit` mode, and `run` with
`stdout`, `stderr`, `exitCode`, `signal`, `timedOut`, `truncated` and
`runTimeMs`.

`GET /api/health` returns the compiler version, the sandbox mode and the limits. `GET /healthz` (liveness) and `GET /readyz` (the worker is reachable) are for orchestrators.

## Project layout

```
server/index.ts        public API: validation, result cache, cancellation, static files, security headers
server/worker.ts       internal worker service (the only place user code runs)
server/compiler.ts     compile / check / emit / run a job with the real compiler
server/sandbox.ts      job slots and queue, per-job uids, rlimits, cleanup, startup self-checks
server/exec.ts         child processes with timeout, output cap and cancellation
server/cache.ts        LRU cache for deterministic results
server/ratelimit.ts    per-client token buckets, concurrency cap, proxy-aware client IPs
server/diagnostics.ts  parses biton's rendered diagnostics (format from lib/exceptions/src/Diagnostic.cpp)
scripts/               stage-compiler.sh, security-check.sh
shared/api.ts          request/response types used by both sides
src/demos.ts           example programs
src/lib/highlight.tsx  highlighter matching biton's lexer (keywords, nested comments, ~> attributes)
src/lib/useHistory.ts  undo/redo, grouping each burst of typing into one step
src/components/        editor, terminal, sidebar, inspector, diagnostics
```

## Scripts

- `npm run dev`: Vite dev server
- `npm run server`: compile server
- `npm run build` / `npm start`: production build / serve it
- `npm run lint`: `tsc --noEmit`
- `npm test`: unit tests (diagnostics parser, cache, rate limiter)
- `scripts/security-check.sh <url>`: isolation checks against a running deployment
