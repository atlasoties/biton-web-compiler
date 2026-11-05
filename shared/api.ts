// Types shared by the compile server (server/) and the frontend (src/).
// Keep this file free of runtime imports so both sides can load it.

/** What the server should do with the source. */
export const COMPILE_MODES = ["run", "check", "emit", "format"] as const;
export type CompileMode = (typeof COMPILE_MODES)[number];

/** Intermediate outputs the real `biton --emit` flag can print. */
export const EMIT_KINDS = ["tokens", "ast", "hir", "typed-hir", "mir", "ir"] as const;
export type EmitKind = (typeof EMIT_KINDS)[number];

export const OPT_LEVELS = ["O0", "O1", "O2", "O3"] as const;
export type OptLevel = (typeof OPT_LEVELS)[number];

export interface CompileRequest {
  code: string;
  mode: CompileMode;
  /** Required when mode is "emit". */
  emit?: EmitKind;
  /** Optimisation level for "run" and "emit ir" (default O2). */
  opt?: OptLevel;
  /** Text fed to the program's standard input ("run" only). */
  stdin?: string;
  /** Arguments passed to the program, after its name ("run" only; see std.env). */
  args?: string[];
  /** Additional files to compile (multi-file support). */
  files?: Record<string, string>;
}

/** Limits on `args` (also enforced by the server). */
export const MAX_ARGS = 64;
export const MAX_ARG_BYTES = 1024;

export type Severity = "error" | "warning" | "note" | "help" | "fatal";

/** One diagnostic parsed from the compiler's rendered output. */
export interface Diagnostic {
  severity: Severity;
  /** Error code such as "E0201", when the compiler printed one. */
  code: string | null;
  message: string;
  /** File the location refers to; "main.bit" is the editor buffer. */
  file: string | null;
  /** 1-based; 0 when the diagnostic has no source location. */
  line: number;
  col: number;
  /** 1-based exclusive end column of the caret underline on `line`. */
  endCol: number;
  /** `= note:` / `= help:` lines and secondary labels. */
  notes: string[];
  /** The diagnostic exactly as the compiler printed it. */
  rendered: string;
}

export interface CompileResponse {
  /** True when every requested step succeeded (compile, and run if asked). */
  success: boolean;
  mode: CompileMode;
  /** Which step stopped the request, if any. */
  failedAt: "compile" | "run" | null;
  diagnostics: Diagnostic[];
  /** Compiler stderr that could not be parsed into diagnostics (link errors etc.). */
  compilerOutput: string;
  compileTimeMs: number;
  /** Served from the result cache (compileTimeMs is from the original compile). */
  cached?: boolean;
  /** Output of `--emit <kind>`. */
  emitted?: string;
  /** The source as `biton fmt` formatted it ("format" only; unchanged when it does not parse). */
  formatted?: string;
  /** Present when the program was run. */
  run?: RunResult;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  /** Process exit code, or null when killed by a signal. */
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  /** True when stdout/stderr hit the size cap and were cut short. */
  truncated: boolean;
  runTimeMs: number;
}

export interface HealthResponse {
  ok: boolean;
  compilerVersion: string;
  /** "uid": each job runs as its own user in the worker container; "none": development. */
  sandbox: "uid" | "none";
  limits: {
    runTimeoutMs: number;
    compileTimeoutMs: number;
    maxOutputBytes: number;
    maxSourceBytes: number;
    maxStdinBytes: number;
  };
}

export interface ErrorResponse {
  error: string;
}

/** A signed-in user (the API knows nothing else about them). */
export interface AuthUser {
  /** Opaque, stable id derived from the email address. */
  id: string;
  email: string;
  name: string;
  provider: "google" | "email";
}

/** GET /api/auth/session */
export interface AuthStatus {
  user: AuthUser | null;
  /** The sign-in methods this deployment offers. */
  providers: { google: boolean; email: boolean };
  /** Running programs needs a signed-in user. */
  requireForRun: boolean;
}

/** `code` of the HTTP 401 the API answers a run with when no one is signed in. */
export const SIGNIN_REQUIRED = "signin_required";
