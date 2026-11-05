import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Braces, FileCode2, Keyboard, Layers, Redo2, SquareTerminal, Undo2 } from "lucide-react";

import TopBar from "./components/layout/TopBar";
import Sidebar, { ActivityRail, type SidePanel } from "./components/layout/Sidebar";
import Split from "./components/layout/Split";
import StatusBar from "./components/layout/StatusBar";
import Console from "./components/output/Console";
import InputPanel from "./components/output/InputPanel";
import Problems from "./components/output/Problems";
import Pipeline from "./components/output/Pipeline";
import SignInDialog from "./components/auth/SignInDialog";
import AccountMenu from "./components/auth/AccountMenu";
import { Badge, IconButton, Tabs, cx } from "./components/ui";
import CodeEditor, { type CursorInfo, type EditorHandle } from "./editor/CodeEditor";

import { DEFAULT_EXAMPLE, EXAMPLE_BY_KEY, EXAMPLE_LIST } from "./examples";
import {
  RateLimitError,
  SignInRequiredError,
  compile,
  compileWithRetry,
  getSession,
  health,
  isAbort,
  redeemSignInLink,
  signOut as apiSignOut,
} from "./lib/api";
import { formatArgs, parseArgs } from "./lib/args";
import { MAX_SHARE_URL, decodeShare, encodeShare } from "./lib/share";
import { load as loadSaved, save } from "./lib/storage";
import { useTheme, type ThemePref } from "./lib/theme";
import { SOURCE_FILE, inBuffer, type Busy, type EmitState, type OutputTab, type TerminalRow, type TerminalRowType } from "./lib/state";
import {
  EMIT_KINDS,
  OPT_LEVELS,
  type AuthStatus,
  type CompileResponse,
  type Diagnostic,
  type EmitKind,
  type HealthResponse,
  type OptLevel,
} from "../shared/api.ts";

const LIVE_CHECK_DELAY_MS = 700;
const SAVE_DELAY_MS = 400;
const MAX_TERMINAL_ROWS = 1000;
const PROGRAM = SOURCE_FILE.replace(/\.bit$/, "");
const DEFAULT_SPLIT = 0.42;
const FONT_SIZES = { min: 11, max: 22, default: 14 };

/** The side panel floats over the editor below this width. */
const SIDEBAR_DOCKS_AT = 1100;
/** Below this width the output pane goes under the editor instead of beside it. */
const STACK_BELOW = 900;

const defaultExample = EXAMPLE_BY_KEY[DEFAULT_EXAMPLE];
const SIDE_PANELS: SidePanel[] = ["files", "language", "stdlib"];
const OUTPUT_TABS: OutputTab[] = ["console", "input", "problems", "pipeline"];

/** localStorage key other tabs watch to learn of a sign-in or sign-out. */
const AUTH_CHANGED = "biton-web-compiler:auth-changed";
function announceAuthChange() {
  try {
    localStorage.setItem(AUTH_CHANGED, String(Date.now()));
  } catch {
    /* other tabs will notice on focus instead */
  }
}

/** What `#auth-error=<code>` (from a failed Google sign-in) means. */
const AUTH_ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  expired: "The sign-in took too long or was started in another tab. Try again.",
  unverified: "That Google account's email address is not verified.",
  google: "Google sign-in failed. Try again.",
};

/** A shell-like rendering of the run, for the console. */
function runCommandLine(opt: OptLevel, args: string[], stdin: string, mainFile: string = SOURCE_FILE): string {
  const prog = mainFile.replace(/\.bit$/, "");
  const argText = args.length ? ` ${formatArgs(args)}` : "";
  const input = stdin ? " < stdin" : "";
  return `biton -${opt} -o ${prog} ${mainFile} && ./${prog}${argText}${input}`;
}

/**
 * Files to send alongside the active buffer. Folder markers are only a UI
 * detail (their keys end in "/"), so they never reach the compiler.
 */
function extraFiles(files: Record<string, string>, activeFile: string): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [name, content] of Object.entries(files)) {
    if (name === activeFile || name.endsWith("/")) continue;
    out[name] = content;
  }
  return Object.keys(out).length ? out : undefined;
}

function useWindowWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

const clampFont = (n: number) => Math.min(FONT_SIZES.max, Math.max(FONT_SIZES.min, Math.round(n)));

export default function App() {
  const saved = useMemo(loadSaved, []);
  const { pref: themePref, setPref: setThemePref } = useTheme();
  const width = useWindowWidth();
  const sidebarFloats = width < SIDEBAR_DOCKS_AT;
  const stacked = width < STACK_BELOW;

  // ── the buffer ─────────────────────────────────────────────────────────
  // The editor owns the text; `code` mirrors it for checks, saving and runs.
  const initialFiles = useMemo(() => {
    if (saved.files && Object.keys(saved.files).length > 0) {
      return saved.files;
    }
    return { [SOURCE_FILE]: saved.code ?? defaultExample.code };
  }, [saved]);
  const [files, setFiles] = useState<Record<string, string>>(initialFiles);
  const [activeFile, setActiveFile] = useState<string>(saved.activeFile && initialFiles[saved.activeFile] !== undefined ? saved.activeFile : SOURCE_FILE);
  const code = files[activeFile] ?? "";
  const codeRef = useRef(code);
  codeRef.current = code;
  const editor = useRef<EditorHandle | null>(null);
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, col: 1, selected: 0 });
  /** Replace the whole buffer as one undoable edit. */
  const replaceCode = useCallback((text: string) => {
    setFiles((f) => ({ ...f, [activeFile]: text }));
    if (editor.current) editor.current.replaceAll(text);
  }, [activeFile]);
  const setCode = useCallback((text: string) => {
    setFiles((f) => ({ ...f, [activeFile]: text }));
  }, [activeFile]);

  const createFile = useCallback((name: string) => {
    const fileName = /\.bit$/i.test(name) ? name : name + ".bit";
    setFiles((f) => {
      const next = { ...f };
      // Make sure every parent folder has a marker so it shows in the sidebar.
      const parts = fileName.split("/");
      for (let i = 1; i < parts.length; i += 1) {
        const folder = `${parts.slice(0, i).join("/")}/`;
        if (next[folder] === undefined) next[folder] = "";
      }
      if (next[fileName] === undefined) next[fileName] = "";
      return next;
    });
    setActiveFile(fileName);
  }, []);

  const createFolder = useCallback((name: string) => {
    const folderName = name.endsWith("/") ? name : name + "/";
    setFiles((f) => {
      const next = { ...f };
      // Create any missing parent folders too (src/lib/ adds src/ as well).
      const parts = folderName.replace(/\/$/, "").split("/");
      for (let i = 1; i <= parts.length; i += 1) {
        const folder = `${parts.slice(0, i).join("/")}/`;
        if (next[folder] === undefined) next[folder] = "";
      }
      return next;
    });
  }, []);

  const deleteFile = useCallback((name: string) => {
    const prefix = name.endsWith("/") ? name : name + "/";
    setFiles((f) => {
      const next = { ...f };
      delete next[name];
      // Also delete files in the folder.
      for (const key of Object.keys(next)) {
        if (key.startsWith(prefix)) {
          delete next[key];
        }
      }
      return next;
    });
    if (activeFile === name || activeFile.startsWith(prefix)) {
      const remaining = Object.keys(files).filter((k) => k !== name && !k.startsWith(prefix) && !k.endsWith("/"));
      setActiveFile(remaining[0] || SOURCE_FILE);
    }
  }, [files, activeFile]);

  const renameFile = useCallback((oldName: string, newName: string) => {
    const oldPrefix = oldName.endsWith("/") ? oldName : oldName + "/";
    const newPrefix = newName.endsWith("/") ? newName : newName + "/";
    setFiles((f) => {
      const next = { ...f };
      if (next[oldName] !== undefined) {
        next[newName] = next[oldName];
        delete next[oldName];
      }
      // Move everything inside a renamed folder.
      for (const key of Object.keys(next)) {
        if (key.startsWith(oldPrefix)) {
          const newKey = newPrefix + key.slice(oldPrefix.length);
          next[newKey] = next[key];
          delete next[key];
        }
      }
      return next;
    });
    if (activeFile === oldName) {
      setActiveFile(newName);
    } else if (activeFile.startsWith(oldPrefix)) {
      setActiveFile(newPrefix + activeFile.slice(oldPrefix.length));
    }
  }, [activeFile]);

  const copyFile = useCallback((name: string, newName: string) => {
    const prefix = name.endsWith("/") ? name : name + "/";
    const copyPrefix = newName.endsWith("/") ? newName : newName + "/";
    setFiles((f) => {
      const next = { ...f };
      if (next[name] !== undefined) {
        next[newName] = next[name];
      }
      // Copy folder contents too.
      for (const key of Object.keys(f)) {
        if (key.startsWith(prefix)) {
          const newKey = copyPrefix + key.slice(prefix.length);
          next[newKey] = f[key];
        }
      }
      return next;
    });
  }, []);

  const [stdin, setStdin] = useState(saved.stdin ?? defaultExample.stdin ?? "");
  const [argsLine, setArgsLine] = useState(saved.args ?? formatArgs(defaultExample.args ?? []));
  const [opt, setOpt] = useState<OptLevel>(OPT_LEVELS.includes(saved.opt as OptLevel) ? (saved.opt as OptLevel) : "O2");
  const [fontSize, setFontSizeState] = useState(clampFont(saved.fontSize ?? FONT_SIZES.default));
  const setFontSize = (n: number) => setFontSizeState(clampFont(n));

  // ── layout ─────────────────────────────────────────────────────────────
  const savedPanel = SIDE_PANELS.includes(saved.sidePanel as SidePanel) ? (saved.sidePanel as SidePanel) : saved.sidePanel === null ? null : "files";
  const [sidePanel, setSidePanel] = useState<SidePanel | null>(window.innerWidth >= SIDEBAR_DOCKS_AT ? savedPanel : null);
  const [showPanel, setShowPanel] = useState(saved.showPanel ?? true);
  const [outputTab, setOutputTab] = useState<OutputTab>(OUTPUT_TABS.includes(saved.outputTab as OutputTab) ? (saved.outputTab as OutputTab) : "console");
  const [split, setSplit] = useState(typeof saved.split === "number" ? saved.split : DEFAULT_SPLIT);
  // A side panel opened over the editor on a narrow window is not a layout choice worth saving.
  const dockedPanel = useRef<SidePanel | null>(savedPanel);
  if (!sidebarFloats) dockedPanel.current = sidePanel;

  // ── compiler state ─────────────────────────────────────────────────────
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  /** Source that `diagnostics` describe; when it differs from `code` they are stale. */
  const [diagnosticsSource, setDiagnosticsSource] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  /** Bumped to re-run the live check after a rate-limit back-off. */
  const [recheck, setRecheck] = useState(0);
  const [lastRun, setLastRun] = useState<CompileResponse | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [serverInfo, setServerInfo] = useState<HealthResponse | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [emit, setEmit] = useState<EmitState>({ kind: "ir", text: null, source: null, failed: false, loading: false });

  const [rows, setRows] = useState<TerminalRow[]>([
    { type: "sys", text: "Programs are compiled to native code by the real biton compiler and run in a sandbox. Type “help” for commands." },
  ]);

  const checkAbort = useRef<AbortController | null>(null);
  const runAbort = useRef<AbortController | null>(null);
  const emitAbort = useRef<AbortController | null>(null);

  const addRow = useCallback((type: TerminalRowType, text: string) => {
    setRows((r) => {
      const next = [...r, { type, text }];
      return next.length > MAX_TERMINAL_ROWS ? next.slice(next.length - MAX_TERMINAL_ROWS) : next;
    });
  }, []);

  /** Show the console (for run output and messages). */
  const showConsole = useCallback(() => {
    setShowPanel(true);
    setOutputTab((t) => (t === "input" || t === "problems" || t === "pipeline" ? "console" : t));
  }, []);

  // ── persistence ────────────────────────────────────────────────────────
  const workspace = () => ({
    code: codeRef.current,
    stdin,
    args: argsLine,
    opt,
    sidePanel: dockedPanel.current,
    showPanel,
    outputTab,
    split,
    fontSize,
    files,
    activeFile,
  });
  useEffect(() => {
    const t = setTimeout(() => save(workspace()), SAVE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, activeFile, stdin, argsLine, opt, sidePanel, showPanel, outputTab, split, fontSize]);

  // ── sign-in ────────────────────────────────────────────────────────────
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [signIn, setSignIn] = useState<{ reason?: string; error?: string } | null>(null);
  const setUser = useCallback((user: AuthStatus["user"]) => setAuth((a) => (a ? { ...a, user } : a)), []);

  const refreshSession = useCallback(async () => {
    try {
      const s = await getSession();
      setAuth(s);
      if (s.user) setSignIn(null);
      return s;
    } catch {
      return null; // the health check reports an unreachable server
    }
  }, []);

  // Signing in or out in one tab (say, from the emailed link) updates the
  // others: they hear it through localStorage, or check again on focus.
  useEffect(() => {
    refreshSession();
    const onStorage = (e: StorageEvent) => e.key === AUTH_CHANGED && refreshSession();
    const onVisible = () => document.visibilityState === "visible" && refreshSession();
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshSession]);

  const signOut = useCallback(async () => {
    try {
      await apiSignOut();
      setUser(null);
      announceAuthChange();
      addRow("sys", "Signed out.");
    } catch (e) {
      addRow("err", `Sign-out failed: ${(e as Error).message}`);
    }
  }, [setUser, addRow]);

  // ── the URL fragment: a share link, a magic sign-in link, or a sign-in result ──
  const openedHash = useRef<string | null>(null);
  const openHash = useCallback(
    async (hash: string) => {
      if (!hash || openedHash.current === hash) return;
      openedHash.current = hash;
      const h = hash.replace(/^#/, "");
      const clearHash = () => window.history.replaceState(null, "", window.location.pathname + window.location.search);
      if (h.startsWith("login=")) {
        clearHash();
        try {
          const user = await redeemSignInLink(h.slice("login=".length));
          setUser(user);
          setSignIn(null);
          refreshSession();
          announceAuthChange();
          addRow("sys", `Signed in as ${user.email}.`);
        } catch (e) {
          setSignIn({ error: (e as Error).message.replace(/ \(HTTP \d+\)$/, "") });
        }
        return;
      }
      if (h === "signed-in") {
        clearHash();
        const s = await refreshSession();
        if (s?.user) {
          announceAuthChange();
          addRow("sys", `Signed in as ${s.user.email}.`);
        }
        return;
      }
      if (h.startsWith("auth-error=")) {
        clearHash();
        setSignIn({ error: AUTH_ERRORS[h.slice("auth-error=".length)] ?? AUTH_ERRORS.google });
        return;
      }
      const shared = await decodeShare(hash);
      if (!shared) {
        if (h.startsWith("s=")) addRow("err", "This share link is damaged and could not be opened.");
        return;
      }
      replaceCode(shared.code);
      setStdin(shared.stdin ?? "");
      setArgsLine(formatArgs(shared.args ?? []));
      addRow("sys", "Opened a shared program. Undo brings your previous code back.");
      clearHash();
    },
    [replaceCode, addRow, setUser, refreshSession],
  );

  useEffect(() => {
    openHash(window.location.hash);
    const onHash = () => openHash(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [openHash]);

  // ── server health ──────────────────────────────────────────────────────
  useEffect(() => {
    const ac = new AbortController();
    health(ac.signal)
      .then((h) => {
        setServerInfo(h);
        setServerError(null);
      })
      .catch((e) => {
        if (isAbort(e)) return;
        setServerError(e.message);
        addRow("err", `Cannot reach the compile server: ${e.message}.`);
      });
    return () => ac.abort();
  }, [addRow]);

  // ── live type-check while typing ──────────────────────────────────────
  useEffect(() => {
    if (diagnosticsSource === code) return;
    const timer = setTimeout(async () => {
      checkAbort.current?.abort();
      const ac = new AbortController();
      checkAbort.current = ac;
      setChecking(true);
      try {
        const res = await compile({ code, mode: "check", files: extraFiles(files, activeFile) }, ac.signal);
        if (codeRef.current !== code) return; // edited since; a newer check is coming
        setDiagnostics(res.diagnostics);
        setDiagnosticsSource(code);
        setServerError(null);
      } catch (e) {
        if (e instanceof RateLimitError) {
          setTimeout(() => setRecheck((n) => n + 1), e.retryAfter * 1000);
        } else if (!isAbort(e)) setServerError((e as Error).message);
      } finally {
        if (checkAbort.current === ac) {
          checkAbort.current = null;
          setChecking(false);
        }
      }
    }, LIVE_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, recheck]);

  const showDiagnostics = useCallback(
    (res: CompileResponse) => {
      for (const d of res.diagnostics) addRow(d.severity === "warning" ? "warn" : "err", d.rendered);
      if (res.compilerOutput) addRow("err", res.compilerOutput);
    },
    [addRow],
  );

  // ── run ────────────────────────────────────────────────────────────────
  const run = useCallback(async () => {
    if (auth?.requireForRun && !auth.user) {
      setSignIn({ reason: "Sign in to run programs." });
      return;
    }
    runAbort.current?.abort();
    checkAbort.current?.abort();
    const ac = new AbortController();
    runAbort.current = ac;
    const source = codeRef.current;
    const args = parseArgs(argsLine);
    setBusy("run");
    showConsole();
    addRow("cmd", runCommandLine(opt, args, stdin, activeFile));

    try {
      const res = await compileWithRetry({ code: source, mode: "run", opt, stdin, args, files: extraFiles(files, activeFile) }, ac.signal);
      setServerError(null);
      setLastRun(res);
      if (codeRef.current === source) {
        setDiagnostics(res.diagnostics);
        setDiagnosticsSource(source);
      }
      const errors = res.diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal");
      const warnings = res.diagnostics.filter((d) => d.severity === "warning");
      showDiagnostics(res);

      if (res.failedAt === "compile") {
        addRow("sys", `Compilation failed: ${errors.length} error(s), ${warnings.length} warning(s) in ${Math.round(res.compileTimeMs)} ms.`);
        return;
      }
      const r = res.run!;
      if (r.stdout) addRow("out", r.stdout.replace(/\n$/, ""));
      if (r.stderr) addRow("err", r.stderr.replace(/\n$/, ""));
      if (r.truncated) addRow("err", "Output limit reached; the program was stopped.");
      if (r.timedOut) addRow("err", `Program timed out after ${serverInfo?.limits.runTimeoutMs ?? "?"} ms and was killed.`);
      else if (r.signal) addRow("err", `Program terminated by ${r.signal} after ${Math.round(r.runTimeMs)} ms.`);
      else if (r.exitCode !== 0) addRow("sys", `Exited with code ${r.exitCode}.`);
      if (warnings.length) addRow("sys", `${warnings.length} warning(s).`);
    } catch (e) {
      if (isAbort(e)) {
        addRow("sys", "Stopped.");
        return;
      }
      const msg = (e as Error).message;
      if (e instanceof RateLimitError) {
        addRow("err", `Slow down: ${msg}.`);
        return;
      }
      if (e instanceof SignInRequiredError) {
        setUser(null);
        setSignIn({ reason: "Your session has ended. Sign in again to run programs." });
        return;
      }
      setServerError(msg);
      addRow("err", `Request failed: ${msg}`);
    } finally {
      if (runAbort.current === ac) {
        runAbort.current = null;
        setBusy(null);
      }
    }
  }, [opt, argsLine, stdin, addRow, showDiagnostics, serverInfo, auth, setUser, showConsole]);

  const stop = useCallback(() => runAbort.current?.abort(), []);

  // ── format ─────────────────────────────────────────────────────────────
  const format = useCallback(async () => {
    const source = codeRef.current;
    setBusy((b) => b ?? "format");
    try {
      const res = await compileWithRetry({ code: source, mode: "format", files: extraFiles(files, activeFile) });
      if (codeRef.current !== source) {
        addRow("sys", "The code changed while it was being formatted; try again.");
      } else if (!res.success || res.formatted === undefined) {
        showConsole();
        addRow("cmd", `biton fmt ${SOURCE_FILE}`);
        showDiagnostics(res);
        addRow("err", "Formatting failed.");
      } else if (res.formatted === source) {
        const broken = diagnosticsSource === source && diagnostics.some((d) => d.severity === "error" || d.severity === "fatal");
        if (broken) addRow("sys", "Not formatted: biton fmt leaves code with syntax errors as it is.");
      } else {
        replaceCode(res.formatted);
      }
    } catch (e) {
      if (!isAbort(e)) addRow("err", `Format failed: ${(e as Error).message}`);
    } finally {
      setBusy((b) => (b === "format" ? null : b));
    }
  }, [addRow, showDiagnostics, replaceCode, diagnostics, diagnosticsSource, showConsole]);

  // ── share ──────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const copy = useCallback(
    async (text: string, done = "Copied") => {
      try {
        await navigator.clipboard.writeText(text);
        setToast(done);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const share = useCallback(async () => {
    const args = parseArgs(argsLine);
    const fragment = await encodeShare({ code: codeRef.current, stdin: stdin || undefined, args: args.length ? args : undefined });
    const url = `${window.location.origin}${window.location.pathname}#${fragment}`;
    if (url.length > MAX_SHARE_URL) {
      showConsole();
      addRow("err", `This program is too large for a share link (${url.length} characters); download it instead.`);
      return;
    }
    if (!(await copy(url, "Share link copied — it includes the code, stdin and arguments"))) {
      showConsole();
      addRow("sys", `Share link:\n${url}`);
    }
  }, [argsLine, stdin, addRow, copy, showConsole]);

  // ── emit (pipeline) ────────────────────────────────────────────────────
  const runEmit = useCallback(
    async (kind: EmitKind) => {
      emitAbort.current?.abort();
      const ac = new AbortController();
      emitAbort.current = ac;
      const source = codeRef.current;
      setEmit((s) => ({ ...s, kind, loading: true }));
      try {
        const res = await compileWithRetry({ code: source, mode: "emit", emit: kind, opt, files: extraFiles(files, activeFile) }, ac.signal);
        const failed = !res.success;
        const text = failed
          ? [...res.diagnostics.map((d) => d.rendered), res.compilerOutput].filter(Boolean).join("\n\n") || "compilation failed"
          : res.emitted ?? "";
        setEmit({ kind, text, source, failed, loading: false });
      } catch (e) {
        if (isAbort(e)) return;
        setEmit({ kind, text: (e as Error).message, source, failed: true, loading: false });
      } finally {
        if (emitAbort.current === ac) emitAbort.current = null;
      }
    },
    [opt],
  );

  // ── files ──────────────────────────────────────────────────────────────
  const currentExample = useMemo(() => EXAMPLE_LIST.find((e) => e.code === code)?.key ?? null, [code]);
  const [lastExample, setLastExample] = useState<string | null>(null);

  const loadExample = (key: string) => {
    const ex = EXAMPLE_BY_KEY[key];
    replaceCode(ex.code);
    setStdin(ex.stdin ?? "");
    setArgsLine(formatArgs(ex.args ?? []));
    setLastExample(key);
    if (sidebarFloats) setSidePanel(null);
    editor.current?.focus();
  };

  const downloadCode = () => {
    const url = URL.createObjectURL(new Blob([codeRef.current], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = activeFile;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const uploadCode = (name: string, text: string) => {
    // Add as a new file or replace active file if same name
    setFiles((f) => ({ ...f, [name]: text }));
    setActiveFile(name);
    setToast(`Opened ${name}`);
  };

  const saveNow = useCallback(() => {
    save(workspace());
    setToast("Saved in this browser");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stdin, argsLine, opt, sidePanel, showPanel, outputTab, split, fontSize]);

  // ── console commands ───────────────────────────────────────────────────
  const runCommand = (query: string) => {
    const [cmd, ...rest] = query.split(/\s+/);
    const echo = () => addRow("cmd", query);
    switch (cmd.toLowerCase()) {
      case "clear":
      case "cls":
        setRows([]);
        return;
      case "help":
        echo();
        addRow(
          "out",
          [
            "run                 compile with the selected -O level and run",
            "check               type-check only (biton --check)",
            "fmt                 format the code (biton fmt)",
            `emit <kind>         show compiler output: ${EMIT_KINDS.join(" | ")}`,
            "args [arguments]    show or set the program's arguments",
            "opt <O0|O1|O2|O3>   set the optimisation level",
            "theme <light|dark|system>",
            "share               copy a link to this program",
            "login / logout      sign in (needed to run programs) / sign out",
            "whoami · version · clear",
            "",
            "Ctrl/⌘+Enter run · Esc stop · Shift+Alt+F format · Ctrl/⌘+F find · Ctrl/⌘+/ comment · Ctrl/⌘+Space complete",
          ].join("\n"),
        );
        return;
      case "run":
        run();
        return;
      case "fmt":
      case "format":
        format();
        return;
      case "share":
        share();
        return;
      case "check":
        echo();
        (() => {
          return compile({ code: codeRef.current, mode: "check", files: extraFiles(files, activeFile) });
        })()
          .then((res) => {
            showDiagnostics(res);
            addRow("sys", res.success ? `No errors (${Math.round(res.compileTimeMs)} ms).` : "Type check failed.");
          })
          .catch((err) => addRow("err", `Request failed: ${err.message}`));
        return;
      case "emit": {
        echo();
        const kind = rest[0] as EmitKind;
        if (!EMIT_KINDS.includes(kind)) {
          addRow("err", `Usage: emit <${EMIT_KINDS.join("|")}>`);
          return;
        }
        runEmit(kind);
        setOutputTab("pipeline");
        return;
      }
      case "args": {
        echo();
        const line = query.slice(cmd.length).trim();
        if (line) setArgsLine(line);
        const args = parseArgs(line || argsLine);
        addRow("sys", args.length ? `Arguments: ${args.map((a) => JSON.stringify(a)).join(" ")}` : "No arguments.");
        return;
      }
      case "opt": {
        echo();
        const level = (rest[0] || "").toUpperCase().replace(/^-/, "");
        if (!OPT_LEVELS.includes(level as OptLevel)) {
          addRow("err", "Usage: opt <O0|O1|O2|O3>");
          return;
        }
        setOpt(level as OptLevel);
        addRow("sys", `Optimisation level set to -${level}.`);
        return;
      }
      case "theme": {
        echo();
        const t = rest[0] as ThemePref;
        if (t !== "light" && t !== "dark" && t !== "system") {
          addRow("err", "Usage: theme <light|dark|system>");
          return;
        }
        setThemePref(t);
        return;
      }
      case "login":
        echo();
        if (auth?.user) addRow("sys", `Already signed in as ${auth.user.email}.`);
        else setSignIn({});
        return;
      case "logout":
        echo();
        if (auth?.user) signOut();
        else addRow("sys", "Not signed in.");
        return;
      case "whoami":
        echo();
        addRow("sys", auth?.user ? `${auth.user.email} (via ${auth.user.provider})` : "Not signed in.");
        return;
      case "version":
        echo();
        addRow("sys", serverInfo ? serverInfo.compilerVersion : `Compile server unavailable${serverError ? `: ${serverError}` : ""}.`);
        return;
      default:
        echo();
        addRow("err", `Unknown command “${cmd}”. Type “help” for the list.`);
    }
  };

  // Shortcuts that work anywhere (the editor handles its own as well).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return; // the editor handled it
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "Enter") {
        e.preventDefault();
        run();
      } else if (e.key === "Escape" && runAbort.current) {
        e.preventDefault();
        stop();
      } else if (e.shiftKey && e.altKey && e.code === "KeyF") {
        e.preventDefault();
        format();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveNow();
      } else if (mod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidePanel((p) => (p ? null : dockedPanel.current ?? "files"));
      } else if (mod && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setShowPanel((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, stop, format, saveNow]);

  const diagnosticsStale = diagnosticsSource !== code;
  const editorDiagnostics = useMemo(() => (diagnosticsStale ? null : diagnostics), [diagnostics, diagnosticsStale]);
  const errorCount = diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal").length;
  const warningCount = diagnostics.filter((d) => d.severity === "warning").length;

  const jump = (d: Diagnostic) => {
    if (inBuffer(d) || (d.file && d.file === activeFile)) {
      editor.current?.jumpTo(d.line, d.col);
      if (d.file && d.file !== activeFile) {
        setActiveFile(d.file);
      }
    }
  };

  const exampleTitle = (currentExample && EXAMPLE_BY_KEY[currentExample].title) || (lastExample && `${EXAMPLE_BY_KEY[lastExample].title} (edited)`) || SOURCE_FILE;
  const stdinLines = stdin === "" ? 0 : stdin.split("\n").length - (stdin.endsWith("\n") ? 1 : 0);
  const argCount = parseArgs(argsLine).length;

  // ── layout ─────────────────────────────────────────────────────────────
  const editorPane = (
    <div className="flex flex-col h-full min-h-0 bg-[var(--editor-bg)]">
      <div className="h-10 shrink-0 flex items-end justify-between border-b border-line bg-surface pl-1.5 pr-2">
        <div className="flex items-end h-full">
          <div className="relative h-[calc(100%-6px)] flex items-center gap-2 px-3 rounded-t-md bg-[var(--editor-bg)] border border-b-0 border-line text-[12.5px] text-fg -mb-px">
            <FileCode2 className="w-3.5 h-3.5 text-accent" />
            <span className="font-medium">{activeFile}</span>
            {errorCount > 0 && !diagnosticsStale && <span className="w-1.5 h-1.5 rounded-full bg-danger" title={`${errorCount} error(s)`} />}
            <span className="absolute inset-x-0 -top-px h-[2px] rounded-t-md bg-accent" />
          </div>
        </div>
        <div className="flex items-center gap-0.5 self-center">
          <IconButton label="Undo (Ctrl+Z)" size="sm" onClick={() => editor.current?.undo()} disabled={!undoState.canUndo}>
            <Undo2 className="w-3.5 h-3.5" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" size="sm" onClick={() => editor.current?.redo()} disabled={!undoState.canRedo}>
            <Redo2 className="w-3.5 h-3.5" />
          </IconButton>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <CodeEditor
          key={activeFile}
          ref={editor}
          initialValue={code}
          onChange={setCode}
          onCursor={setCursor}
          onHistory={setUndoState}
          diagnostics={editorDiagnostics}
          onRun={run}
          onFormat={format}
          onSave={saveNow}
          fontSize={fontSize}
        />
      </div>
    </div>
  );

  const outputPane = (
    <div className="flex flex-col h-full min-h-0 bg-surface">
      <Tabs<OutputTab>
        value={outputTab}
        onChange={setOutputTab}
        tabs={[
          { key: "console", label: "Console", icon: <SquareTerminal className="w-3.5 h-3.5" /> },
          {
            key: "input",
            label: "Input",
            icon: <Keyboard className="w-3.5 h-3.5" />,
            badge:
              stdinLines + argCount > 0 ? (
                <span className="w-1.5 h-1.5 rounded-full bg-accent" title={`${argCount} argument(s), ${stdinLines} line(s) of stdin`} />
              ) : undefined,
          },
          {
            key: "problems",
            label: "Problems",
            icon: <AlertCircle className="w-3.5 h-3.5" />,
            badge: errorCount ? <Badge tone="danger">{errorCount}</Badge> : warningCount ? <Badge tone="warning">{warningCount}</Badge> : undefined,
          },
          { key: "pipeline", label: "Pipeline", icon: <Layers className="w-3.5 h-3.5" /> },
        ]}
        trailing={
          <IconButton label="Hide panel (Ctrl+J)" size="sm" onClick={() => setShowPanel(false)}>
            <span className="text-[15px] leading-none">×</span>
          </IconButton>
        }
      />
      <div className="flex-1 min-h-0">
        {outputTab === "console" && <Console rows={rows} clear={() => setRows([])} onCommand={runCommand} lastRun={lastRun} running={busy === "run"} />}
        {outputTab === "input" && (
          <InputPanel args={argsLine} setArgs={setArgsLine} stdin={stdin} setStdin={setStdin} maxStdinBytes={serverInfo?.limits.maxStdinBytes} />
        )}
        {outputTab === "problems" && <Problems diagnostics={diagnostics} stale={diagnosticsStale} checking={checking} onSelect={jump} />}
        {outputTab === "pipeline" && <Pipeline emit={emit} code={code} opt={opt} runEmit={runEmit} copy={(t) => copy(t)} />}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-dvh min-h-[420px] bg-bg text-fg overflow-hidden">
      {signIn && auth && (
        <SignInDialog
          providers={auth.providers}
          reason={signIn.reason}
          error={signIn.error}
          onClose={() => setSignIn(null)}
          beforeLeave={() => save(workspace())}
        />
      )}

      <TopBar
        busy={busy}
        run={run}
        stop={stop}
        format={format}
        share={share}
        opt={opt}
        setOpt={setOpt}
        themePref={themePref}
        setThemePref={setThemePref}
        account={<AccountMenu auth={auth} openSignIn={() => setSignIn({})} signOut={signOut} />}
        showSidebar={sidePanel !== null}
        toggleSidebar={() => setSidePanel((p) => (p ? null : dockedPanel.current ?? "files"))}
        showPanel={showPanel}
        togglePanel={() => setShowPanel((v) => !v)}
        title={exampleTitle}
      />

      <div className="flex flex-1 min-h-0 relative">
        <div className="hidden sm:flex">
          <ActivityRail active={sidePanel} setActive={setSidePanel} />
        </div>
        {sidePanel && sidebarFloats && <div className="absolute inset-0 z-20 bg-[var(--overlay)] sm:left-12" onClick={() => setSidePanel(null)} aria-hidden="true" />}
        {sidePanel && (
          <div className={cx("flex h-full", sidebarFloats && "absolute inset-y-0 left-0 sm:left-12 z-30 shadow-pop")}>
            <Sidebar
              panel={sidePanel}
              close={() => setSidePanel(null)}
              examples={EXAMPLE_LIST}
              currentExample={currentExample}
              loadExample={loadExample}
              downloadCode={downloadCode}
              uploadCode={uploadCode}
              fileName={activeFile}
              modified={true}
              files={files}
              activeFile={activeFile}
              onFileSelect={(name) => {
                setActiveFile(name);
                if (sidebarFloats) setSidePanel(null);
              }}
              onCreateFile={createFile}
              onCreateFolder={createFolder}
              onDeleteFile={deleteFile}
              onRenameFile={renameFile}
              onCopyFile={copyFile}
            />
          </div>
        )}

        <main className="flex-1 min-w-0 flex">
          {showPanel ? (
            <Split
              direction={stacked ? "column" : "row"}
              fraction={split}
              setFraction={setSplit}
              defaultFraction={DEFAULT_SPLIT}
              first={editorPane}
              second={outputPane}
            />
          ) : (
            <div className="flex-1 min-w-0 flex flex-col">{editorPane}</div>
          )}
        </main>
      </div>

      <StatusBar
        serverInfo={serverInfo}
        serverError={serverError}
        diagnostics={diagnosticsStale ? null : diagnostics}
        opt={opt}
        cursor={cursor}
        openProblems={() => {
          setShowPanel(true);
          setOutputTab("problems");
        }}
        fontSize={fontSize}
        setFontSize={setFontSize}
      />

      {toast && (
        <div
          role="status"
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 h-9 rounded-lg bg-fg text-bg text-[13px] font-medium shadow-pop animate-pop"
        >
          <Braces className="w-3.5 h-3.5 opacity-70" />
          {toast}
        </div>
      )}
    </div>
  );
}
