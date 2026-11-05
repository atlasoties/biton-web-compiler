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

- **A real code editor** ([CodeMirror 6](https://codemirror.net), as in Replit): Biton highlighting that follows the compiler's lexer, auto-indent, bracket matching and auto-closing, code folding, multiple cursors, find and replace, comment toggling, and completion of keywords, snippets, names in the file and `import std.<module>` modules and their exports.
- **Light and dark themes**, or follow the system; chosen in the top bar (or `theme light|dark|system` in the console), applied before the first paint.
- **An IDE layout**: a side panel (files and examples, the language reference, the standard library, each searchable), the editor, and a resizable Console / Input / Problems / Pipeline pane beside it (under it on narrow screens), and a status bar with the cursor position, errors and warnings, and the font size.

- **Real compilation**: compiled with `biton` at `-O0`–`-O3` and run natively. `main`'s return value is the exit code.
- **Program input**: standard input (for `std.io.read_line`) and command-line arguments (for `std.env.args`), in the Input tab.
- **Live diagnostics**: `biton --check` runs as you type. Errors and warnings are underlined in the code with the compiler's message on hover, marked in the gutter, and listed under Problems; clicking one jumps to it.
- **Pipeline inspector**: the output of every compiler stage (`--emit tokens | ast | hir | typed-hir | mir | ir`).
- **Formatting** with `biton fmt` (Shift+Alt+F), as one undo step.
- **Examples**: nine programs in the current (beta) syntax: basics and printing, structs/enums/unions, errors as values, generics and traits, closures, collections (`Vec`, `Map`, sorting, `Text`), pointers and ownership, stdin and arguments, and maths with seeded randomness. `npm run test:examples` runs each one with the real compiler and compares its output with `src/examples/<name>.out`.
- **Language and stdlib reference** in the sidebar (`src/reference.ts`), taken from `../biton/README.md`, `grammar/biton.bnf` and `stdlib/*.bit`.
- **Share links**: the code, stdin and arguments, compressed into the URL fragment (never sent to the server).
- **Your work is kept** in the browser (code, input, `-O` level, layout) across reloads.
- **Console commands**: `run`, `check`, `fmt`, `emit <kind>`, `args [...]`, `opt <O0..O3>`, `theme`, `share`, `login`/`logout`, `version`, `clear`, `help` (↑/↓ for history).
- **Shortcuts**: Ctrl/⌘+Enter run · Esc stop · Shift+Alt+F format · Ctrl/⌘+F find · Ctrl/⌘+/ comment · Ctrl/⌘+Space complete · Ctrl/⌘+B side panel · Ctrl/⌘+J output pane · Ctrl/⌘+S save.
- **Works on small screens**: the side panel opens over the editor and the output pane goes under it.
- **Sign-in with Google or an emailed link**, required to run programs (checking, formatting and the pipeline view stay open to everyone). See [Sign-in](#sign-in).

## Run locally (development)

Prerequisites: Node.js 22.18+ and the `biton` compiler: `../biton/install.sh`
puts it on your `PATH` (`~/.local/bin/biton`), with its standard library.

```bash
npm install
npm run dev:all     # → http://localhost:5180 (UI), API on :8787; Ctrl+C stops both
```

`UI_PORT` and `API_PORT` change the ports. To run the two separately:
`npm run server` (API on :8080) and `npm run dev` (UI on :5173, `/api` proxied
to `BITON_API_TARGET`, default :8080).

Development mode runs programs as your own user with only time and output
limits. Don't expose it.

Sign-in works out of the box in development: without `SMTP_URL`, "Email me a
sign-in link" shows the link right in the dialog (and the server log) instead
of sending it. Set
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` to try Google too (redirect URI
`http://localhost:5180/api/auth/google/callback` with `dev:all`), or `REQUIRE_SIGNIN_TO_RUN=0`
to turn the requirement off.

## Deploy (production)

```
internet ──TLS proxy──▶ web :8080 ──(internal network)──▶ worker :9000
                         API + frontend                   compiler + programs
                         never runs user code             no internet access
```

```bash
scripts/stage-compiler.sh ../biton                   # copy the built compiler + stdlib/ into vendor/, and check them
echo "WORKER_TOKEN=$(openssl rand -hex 32)" > .env
echo "AUTH_SECRET=$(openssl rand -hex 32)" >> .env
echo "PUBLIC_URL=https://biton.example.com" >> .env
# plus GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET and/or SMTP_URL/EMAIL_FROM (see Sign-in)
docker compose up -d --build
scripts/security-check.sh http://127.0.0.1:8080      # 16 hostile-program checks; all must PASS
```

Put a TLS-terminating proxy (Caddy, nginx, a cloud load balancer) in front
of the `web` service, and set `TRUST_PROXY` to the number of proxies (usually
`1`) so rate limits apply per user rather than to the proxy's address. All settings are documented in [`.env.example`](.env.example).

## Sign-in

Anyone can edit, type-check, format and inspect the compiler pipeline.
**Running a program needs a signed-in user** (`REQUIRE_SIGNIN_TO_RUN=0`
turns that off), and signed-in users get their own rate-limit budget instead
of sharing their IP address's.

| Method | Setup |
|---|---|
| **Google** | In the Google Cloud console, create an OAuth client ID of type *Web application* with the authorised redirect URI `$PUBLIC_URL/api/auth/google/callback`. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. |
| **Email link** | Set `SMTP_URL` (`smtps://user:pass@host:465`, or `smtp://...:587` with STARTTLS; any provider such as SES, Resend, Postmark or Mailgun) and `EMAIL_FROM`. |

Either or both can be enabled; production refuses to start with sign-in
required and neither configured. `PUBLIC_URL` (the origin users open) and
`AUTH_SECRET` (`openssl rand -hex 32`) are required in production.

How it works (`server/auth.ts`):

- **No user database.** A session is an HMAC-signed, `HttpOnly`, `SameSite=Lax`
  cookie (`__Host-` prefixed and `Secure` on https) holding the verified email
  address, valid for `SESSION_DAYS` (30). Sessions are stateless: signing out
  clears the cookie but cannot revoke a stolen copy before it expires;
  changing `AUTH_SECRET` signs everyone out.
- **Google** uses the authorization-code flow with PKCE, `state` and `nonce`,
  kept in a signed 10-minute cookie. The ID token comes straight from
  Google's token endpoint over TLS; its issuer, audience, expiry and nonce
  are checked, and the email address must be verified.
- **Email links** are signed, expire after 15 minutes and work once. They
  point at the app (`/#login=...`): the fragment never reaches a server, so
  mail scanners that prefetch links can't use them up, and the page redeems
  the token with a POST. At most 5 emails per address and 10 per client IP
  per hour (`SIGNIN_EMAILS_PER_*`).
- **CSRF:** cookies are `SameSite=Lax`, and state-changing requests that
  carry a session are refused unless their `Origin` is `PUBLIC_URL`.
- The used-link list and the email throttle are in memory per API instance,
  like the rate limits. With several replicas, a link could be redeemed once
  per replica within its 15 minutes.
- Sign-in needs the frontend on the API's own origin (the default); with
  `CORS_ORIGIN` the cookies are not sent.

## Security model

Biton programs can run any shell command (`std.process.run`), read and
write files (`std.fs`) and read the environment (`std.env`), so the worker
treats every job as hostile code.

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
| Checks | 120/min, burst 40 | `check`, `emit` and `format`. Cache hits are free, so the live check rarely uses it. |
| Concurrency | 3 jobs per client | everything that reaches the worker |

Refusals are HTTP 429 with `Retry-After` and `RateLimit-*` headers. The
editor backs off on its own: the live check retries silently, and a run
retries once after a short refusal. Limits are kept in memory per API
instance; with several replicas, also limit at the load balancer. The worker's
queue (`MAX_QUEUE`) is the global backstop.

**Caching:** type checks, `--emit` output and formatting are cached in the API, in
memory (`CACHE_MB`), keyed by compiler version and source. Program runs are
never cached.

## API

`POST /api/compile`

```jsonc
{ "code": "fn main() int {\n    print(\"hi\")\n    return 42\n}\n",
  "mode": "run",          // "run" | "check" | "emit" | "format"
  "emit": "ir",           // with mode "emit": tokens | ast | hir | typed-hir | mir | ir
  "opt": "O2",            // O0 | O1 | O2 | O3
  "stdin": "",            // optional program input (run)
  "args": ["a", "b c"] }  // optional program arguments (run; at most 64, 1 KiB each)
```

The response (types in [`shared/api.ts`](shared/api.ts)) has `success`,
`failedAt` (`"compile"` / `"run"` / `null`), and `diagnostics[]`. Each
diagnostic has `severity`, `code`, `message`, `file`, `line`, `col`,
`endCol`, `notes`, and `rendered` (the exact compiler text). The response
also has `compilerOutput` (anything that isn't a diagnostic, such as linker
errors), `compileTimeMs`, `emitted` for `emit` mode, `formatted` for
`format` mode (the input unchanged when it does not parse), and `run` with
`stdout`, `stderr`, `exitCode`, `signal`, `timedOut`, `truncated` and
`runTimeMs`.

With sign-in required, a `run` without a session gets HTTP 401 with
`{ "code": "signin_required" }`. Sign-in endpoints: `GET /api/auth/session`,
`GET /api/auth/google` (and its `/callback`), `POST /api/auth/email`
`{ email }`, `POST /api/auth/email/verify` `{ token }`, `POST /api/auth/logout`.

`GET /api/health` returns the compiler version, the sandbox mode and the limits. `GET /healthz` (liveness) and `GET /readyz` (the worker is reachable) are for orchestrators.

## Project layout

```
server/index.ts        public API: validation, result cache, cancellation, static files, security headers
server/auth.ts         sign-in: Google (OIDC + PKCE), email magic links, signed session cookies
server/worker.ts       internal worker service (the only place user code runs)
server/compiler.ts     compile / check / emit / format / run a job with the real compiler
server/sandbox.ts      job slots and queue, per-job uids, rlimits, cleanup, startup self-checks
server/exec.ts         child processes with timeout, output cap and cancellation
server/cache.ts        LRU cache for deterministic results
server/ratelimit.ts    per-client token buckets, concurrency cap, proxy-aware client IPs
server/diagnostics.ts  parses biton's rendered diagnostics (compiler/diagnostics in ../biton)
scripts/               stage-compiler.sh, security-check.sh
shared/api.ts          request/response types used by both sides
src/examples/          example programs (.bit), their expected output (.out) and manifest.ts
src/reference.ts       the sidebar's language and stdlib reference
src/editor/            CodeMirror: the Biton language (highlighting, indentation, folding, completion) and the editor component
src/lib/tokenize.ts    highlighter matching biton's lexer, for snippets outside the editor
src/lib/theme.ts       light/dark/system theme (public/theme-init.js applies it before first paint)
src/index.css          design tokens for both themes (every colour is a CSS variable)
src/lib/share.ts       share links;  src/lib/storage.ts  the saved workspace;  src/lib/args.ts  argument parsing
src/lib/useHistory.ts  undo/redo, grouping each burst of typing into one step
src/components/        layout (top bar, side panel, split, status bar), output (console, input, problems, pipeline), auth, ui primitives
test/examples.test.ts  every example through the real compiler and the job pipeline
```

## Scripts

- `npm run dev`: Vite dev server
- `npm run server`: compile server
- `npm run build` / `npm start`: production build / serve it
- `npm run lint`: `tsc --noEmit`
- `npm test`: all tests: unit tests (diagnostics parser, cache, rate limiter, request validation,
  sign-in flows against a fake Google and mailer, argument parsing, highlighter, the editor's Biton
  language: highlighting, indentation, folding, completion) and the examples against the real compiler (skipped without `biton`)
- `npm run test:examples`: just the examples; `UPDATE_EXAMPLES=1` rewrites their `.out` files
- `npm run check`: lint, tests and build, as CI would

When `../biton` is checked out next to this repository, two tests compare
against it: the highlighter's keywords with its lexer's keyword table, and the
completion list with the `pub` declarations in its `stdlib/`. A language or
library change there fails the tests here until this side is updated.
- `scripts/security-check.sh <url>`: isolation checks against a running deployment
