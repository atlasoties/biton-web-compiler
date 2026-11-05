import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Braces, FilePlus2, Keyboard, Layers, Redo2, SquareTerminal, Undo2 } from "lucide-react";

import TopBar from "./components/layout/TopBar";
import Sidebar, { ActivityRail, type SidePanel } from "./components/layout/Sidebar";
import Split from "./components/layout/Split";
import StatusBar from "./components/layout/StatusBar";
import Console from "./components/output/Console";
import InputPanel from "./components/output/InputPanel";
import Problems from "./components/output/Problems";
import Pipeline from "./components/output/Pipeline";
import AccountMenu from "./components/auth/AccountMenu";
import { ConfirmDialog } from "./components/Dialog";
import EditorTabs from "./components/files/EditorTabs";
import QuickOpen from "./components/files/QuickOpen";
import type { FileProblems } from "./components/files/FileExplorer";
import { Badge, Button, IconButton, Kbd, Tabs, cx } from "./components/ui";
import CodeEditor, { type CursorInfo, type EditorHandle } from "./editor/CodeEditor";
import type { AIStatus } from "./editor/ai";

import { DEFAULT_EXAMPLE, EXAMPLE_BY_KEY, EXAMPLE_LIST } from "./examples";
import {
  RateLimitError,
  SignInRequiredError,
  compile,
  compileWithRetry,
  health,
  isAbort,
} from "./lib/api";
import { formatArgs, parseArgs } from "./lib/args";
import { readPicked, type Picked } from "./lib/importFiles";
import { basename, dirname, freshPath, importsOf, isFile, joinPath, kindOf, listFiles, pathProblem, uniquePath, type Files } from "./lib/project";
import { MAX_SHARE_URL, encodeShare } from "./lib/share";
import { load as loadPrefs, save as savePrefs, type Saved } from "./lib/storage";
import { ProjectStore, isProjectKey, type ProjectDoc } from "./lib/projects";
import type { Auth } from "./lib/useAuth";
import { useTheme, type ThemePref } from "./lib/theme";
import { SOURCE_FILE, type Busy, type EmitState, type OutputTab, type TerminalRow, type TerminalRowType } from "./lib/state";
import { projectFrom, useProject } from "./lib/useProject";
import { zip } from "./lib/zip";
import {
  AI_MAX_RELATED_CHARS,
  AI_MAX_RELATED_FILES,
  EMIT_KINDS,
  OPT_LEVELS,
  type AuthStatus,
  type CompileRequest,
  type CompileResponse,
  type Diagnostic,
  type EmitKind,
  type HealthResponse,
  type OptLevel,
} from "../shared/api.ts";

const LIVE_CHECK_DELAY_MS = 700;
const SAVE_DELAY_MS = 400;
const MAX_TERMINAL_ROWS = 1000;
const DEFAULT_SPLIT = 0.42;
const FONT_SIZES = { min: 11, max: 22, default: 14 };
const TOAST_MS = 2600;
const UNDO_TOAST_MS = 8000;
const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? "⌘" : "Ctrl";

/** The side panel floats over the editor below this width. */
const SIDEBAR_DOCKS_AT = 1100;
/** Below this width the output pane goes under the editor instead of beside it. */
const STACK_BELOW = 900;

const defaultExample = EXAMPLE_BY_KEY[DEFAULT_EXAMPLE];
const SIDE_PANELS: SidePanel[] = ["files", "language", "stdlib"];
const OUTPUT_TABS: OutputTab[] = ["console", "input", "problems", "pipeline"];

/** A shell-like rendering of the run, for the console. */
function runCommandLine(opt: OptLevel, args: string[], stdin: string, mainFile: string): string {
  const prog = mainFile.replace(/\.bit$/, "");
  const argText = args.length ? ` ${formatArgs(args)}` : "";
  const input = stdin ? " < stdin" : "";
  return `biton -${opt} -o ${prog} ${mainFile} && ./${prog}${argText}${input}`;
}

/**
 * A compile request for `target` with the rest of the project beside it.
 * Folder markers are a UI detail and never reach the server.
 */
function projectRequest(files: Files, target: string): Pick<CompileRequest, "code" | "entry" | "files"> {
  const others: Record<string, string> = {};
  for (const [name, content] of Object.entries(files)) {
    if (name !== target && !name.endsWith("/")) others[name] = content;
  }
  return { code: files[target] ?? "", entry: target, files: Object.keys(others).length ? others : undefined };
}

/** Diagnostics without a file are about the file that was compiled. */
const located = (ds: Diagnostic[], target: string) => ds.map((d) => (d.file ? d : { ...d, file: target }));

const isSource = (path: string | null): path is string => !!path && path.endsWith(".bit");

function useWindowWidth(): number {
  const [w, setW] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}

const clampFont = (n: number) => Math.min(FONT_SIZES.max, Math.round(Math.max(FONT_SIZES.min, n)));

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Toast {
  text: string;
  action?: { label: string; run: () => void };
  tone?: "error";
}

/** A pending question for the user (import conflicts, opening a shared project). */
type Ask = { kind: "import"; entries: Array<{ path: string; content: string }>; conflicts: string[]; skipped: number };

interface WorkspaceProps {
  projectId: string;
  projectName: string;
  /** The project as stored when it was opened. */
  doc: ProjectDoc;
  store: ProjectStore;
  auth: Auth;
  /** Back to the project list. */
  onHome: () => void;
  onRename: (name: string) => void;
}

export default function Workspace({ projectId, projectName, doc, store, auth: authApi, onHome, onRename }: WorkspaceProps) {
  const saved = useMemo(loadPrefs, []);
  const { auth, setUser, signOut } = authApi;
  const setSignIn = (p: { reason?: string }) => authApi.openSignIn(p.reason);
  const { pref: themePref, setPref: setThemePref } = useTheme();
  const width = useWindowWidth();
  const sidebarFloats = width < SIDEBAR_DOCKS_AT;
  const stacked = width < STACK_BELOW;

  // ── the project ────────────────────────────────────────────────────────
  const editor = useRef<EditorHandle | null>(null);
  const { project, latest, entry, actions } = useProject(() => projectFrom(doc, defaultExample.code), editor);
  const { files, tabs, active } = project;
  const code = active !== null ? (files[active] ?? "") : "";
  const codeRef = useRef(code);
  codeRef.current = code;
  const [undoState, setUndoState] = useState({ canUndo: false, canRedo: false });
  const [cursor, setCursor] = useState<CursorInfo>({ line: 1, col: 1, selected: 0 });
  /** Where to put the cursor once a file opened from a diagnostic is shown. */
  const pendingJump = useRef<{ path: string; line: number; col: number } | null>(null);
  const [revealToken, setRevealToken] = useState(0);
  const [quickOpen, setQuickOpen] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);

  const [stdin, setStdin] = useState(doc.stdin ?? "");
  const [argsLine, setArgsLine] = useState(doc.args ?? "");
  const [opt, setOpt] = useState<OptLevel>(OPT_LEVELS.includes(saved.opt as OptLevel) ? (saved.opt as OptLevel) : "O2");
  const [fontSize, setFontSizeState] = useState(clampFont(saved.fontSize ?? FONT_SIZES.default));
  const setFontSize = (n: number) => setFontSizeState(clampFont(n));
  const [aiEnabled, setAiEnabled] = useState(saved.ai !== false);
  const [aiStatus, setAiStatus] = useState<AIStatus>({ state: "idle" });

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
  /** Diagnostics, with the project snapshot and file they were produced for (to tell when they are stale). */
  const [diag, setDiag] = useState<{ list: Diagnostic[]; files: Files | null; target: string | null }>({ list: [], files: null, target: null });
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

  // ── toasts ─────────────────────────────────────────────────────────────
  const [toast, setToastState] = useState<Toast | null>(null);
  const notify = useCallback((t: Toast | string) => setToastState(typeof t === "string" ? { text: t } : t), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToastState(null), toast.action ? UNDO_TOAST_MS : TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // ── persistence ────────────────────────────────────────────────────────
  // Preferences (layout, font, -O level, AI) are shared by every project; the
  // project itself (files, tabs, entry, stdin, arguments) has its own record.
  /** Another tab saved this project; stop saving over it until the user decides. */
  const [conflict, setConflict] = useState(false);
  const storageWarned = useRef(false);
  /** The files as last saved, to tell an edit from a tab switch. */
  const savedFiles = useRef(project.files);
  const prefs = (): Saved => ({ opt, sidePanel: dockedPanel.current, showPanel, outputTab, split, fontSize, ai: aiEnabled });
  const projectDoc = (): ProjectDoc => ({
    files: latest.current.files,
    tabs: latest.current.tabs,
    activeFile: latest.current.active,
    entry: latest.current.entry,
    recent: latest.current.recent,
    stdin,
    args: argsLine,
  });
  const snapshot = useRef({ prefs, projectDoc });
  snapshot.current = { prefs, projectDoc };
  const persist = useCallback(() => {
    savePrefs(snapshot.current.prefs());
    const d = snapshot.current.projectDoc();
    const ok = store.save(projectId, d, d.files !== savedFiles.current);
    if (ok) {
      savedFiles.current = d.files;
      storageWarned.current = false;
      return true;
    }
    if (!storageWarned.current) {
      storageWarned.current = true;
      notify({
        text: "Browser storage is full: changes are not being saved. Download the project, or delete projects you no longer need.",
        tone: "error",
        action: { label: "Download", run: () => void downloadRef.current("") },
      });
    }
    return false;
  }, [notify, store, projectId]);
  useEffect(() => {
    if (conflict) return;
    const t = setTimeout(persist, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [project, stdin, argsLine, opt, sidePanel, showPanel, outputTab, split, fontSize, aiEnabled, conflict, persist]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => isProjectKey(e.key, projectId) && e.newValue !== null && setConflict(true);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [projectId]);
  // Save what is pending when the page goes away or the project is closed.
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;
  useEffect(() => {
    const flush = () => !conflictRef.current && persist();
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [persist]);

  const resolveConflict = (useTheirs: boolean) => {
    const theirs = useTheirs ? store.load(projectId) : null;
    if (theirs) {
      actions.replace(projectFrom(theirs, ""));
      setStdin(theirs.stdin ?? "");
      setArgsLine(theirs.args ?? "");
      savedFiles.current = theirs.files;
    }
    setConflict(false);
    if (!useTheirs) persist();
  };

  // ── editing the open file ──────────────────────────────────────────────
  /** Replace the open file's text as one undoable edit (creating main.bit if nothing is open). */
  const replaceCode = useCallback(
    (text: string) => {
      const path = latest.current.active;
      if (path === null) {
        actions.create(freshPath(latest.current.files, "", SOURCE_FILE), "file", text);
        return;
      }
      if (editor.current) editor.current.replaceAll(text);
      else actions.write(path, text);
    },
    [actions, latest],
  );

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

  // ── live type-check of the open file while typing ──────────────────────
  const diagnosticsStale = diag.files !== files || diag.target !== active;
  useEffect(() => {
    if (!diagnosticsStale || !isSource(active)) return;
    const target = active;
    const snapshot = files;
    const timer = setTimeout(async () => {
      checkAbort.current?.abort();
      const ac = new AbortController();
      checkAbort.current = ac;
      setChecking(true);
      try {
        const res = await compile({ ...projectRequest(snapshot, target), mode: "check" }, ac.signal);
        if (latest.current.files !== snapshot || latest.current.active !== target) return; // a newer check is coming
        setDiag({ list: located(res.diagnostics, target), files: snapshot, target });
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
  }, [files, active, recheck]);

  const showDiagnostics = useCallback(
    (ds: Diagnostic[], compilerOutput: string) => {
      for (const d of ds) addRow(d.severity === "warning" ? "warn" : "err", d.rendered);
      if (compilerOutput) addRow("err", compilerOutput);
    },
    [addRow],
  );

  // ── run ────────────────────────────────────────────────────────────────
  const run = useCallback(async () => {
    if (auth?.requireForRun && !auth.user) {
      setSignIn({ reason: "Sign in to run programs." });
      return;
    }
    const snapshot = latest.current.files;
    const target = entry ?? (isSource(latest.current.active) ? latest.current.active : null);
    if (!target) {
      showConsole();
      addRow("err", "Nothing to run: create main.bit, or right-click a .bit file and choose “Set as Entry Point”.");
      return;
    }
    runAbort.current?.abort();
    checkAbort.current?.abort();
    const ac = new AbortController();
    runAbort.current = ac;
    const args = parseArgs(argsLine);
    setBusy("run");
    showConsole();
    addRow("cmd", runCommandLine(opt, args, stdin, target));

    try {
      const res = await compileWithRetry({ ...projectRequest(snapshot, target), mode: "run", opt, stdin, args }, ac.signal);
      setServerError(null);
      setLastRun(res);
      const ds = located(res.diagnostics, target);
      if (latest.current.files === snapshot) setDiag({ list: ds, files: snapshot, target });
      const errors = ds.filter((d) => d.severity === "error" || d.severity === "fatal");
      const warnings = ds.filter((d) => d.severity === "warning");
      showDiagnostics(ds, res.compilerOutput);

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
  }, [opt, argsLine, stdin, addRow, showDiagnostics, serverInfo, auth, setUser, showConsole, entry, latest]);

  const stop = useCallback(() => runAbort.current?.abort(), []);

  // ── format ─────────────────────────────────────────────────────────────
  const format = useCallback(async () => {
    const target = latest.current.active;
    if (!isSource(target)) return;
    const snapshot = latest.current.files;
    const source = snapshot[target];
    setBusy((b) => b ?? "format");
    try {
      const res = await compileWithRetry({ ...projectRequest(snapshot, target), mode: "format" });
      if (latest.current.active !== target || latest.current.files[target] !== source) {
        addRow("sys", "The code changed while it was being formatted; try again.");
      } else if (!res.success || res.formatted === undefined) {
        showConsole();
        addRow("cmd", `biton fmt ${target}`);
        showDiagnostics(located(res.diagnostics, target), res.compilerOutput);
        addRow("err", "Formatting failed.");
      } else if (res.formatted === source) {
        const broken = diag.target === target && diag.files === snapshot && diag.list.some((d) => d.file === target && (d.severity === "error" || d.severity === "fatal"));
        if (broken) addRow("sys", "Not formatted: biton fmt leaves code with syntax errors as it is.");
      } else {
        replaceCode(res.formatted);
      }
    } catch (e) {
      if (!isAbort(e)) addRow("err", `Format failed: ${(e as Error).message}`);
    } finally {
      setBusy((b) => (b === "format" ? null : b));
    }
  }, [addRow, showDiagnostics, replaceCode, diag, showConsole, latest]);

  // ── clipboard and share ────────────────────────────────────────────────
  const copy = useCallback(
    async (text: string, done = "Copied") => {
      try {
        await navigator.clipboard.writeText(text);
        notify(done);
        return true;
      } catch {
        return false;
      }
    },
    [notify],
  );

  const share = useCallback(async () => {
    const args = parseArgs(argsLine);
    const s = latest.current;
    const fileCount = listFiles(s.files).length;
    const fragment = await encodeShare(
      fileCount > 1
        ? { code: codeRef.current, files: s.files, entry: entry ?? undefined, active: s.active ?? undefined, stdin: stdin || undefined, args: args.length ? args : undefined }
        : { code: codeRef.current, stdin: stdin || undefined, args: args.length ? args : undefined },
    );
    const url = `${window.location.origin}${window.location.pathname}#${fragment}`;
    if (url.length > MAX_SHARE_URL) {
      showConsole();
      addRow("err", `This ${fileCount > 1 ? "project" : "program"} is too large for a share link (${url.length} characters); download it instead.`);
      return;
    }
    const what = fileCount > 1 ? `all ${fileCount} files` : "the code";
    if (!(await copy(url, `Share link copied — it includes ${what}, stdin and arguments`))) {
      showConsole();
      addRow("sys", `Share link:\n${url}`);
    }
  }, [argsLine, stdin, addRow, copy, showConsole, latest, entry]);

  // ── emit (pipeline) ────────────────────────────────────────────────────
  const runEmit = useCallback(
    async (kind: EmitKind) => {
      const target = latest.current.active;
      if (!isSource(target)) {
        setEmit({ kind, text: "Open a .bit file to see what the compiler makes of it.", source: null, failed: true, loading: false });
        return;
      }
      emitAbort.current?.abort();
      const ac = new AbortController();
      emitAbort.current = ac;
      const snapshot = latest.current.files;
      const source = snapshot[target];
      setEmit((s) => ({ ...s, kind, loading: true }));
      try {
        const res = await compileWithRetry({ ...projectRequest(snapshot, target), mode: "emit", emit: kind, opt }, ac.signal);
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
    [opt, latest],
  );

  // ── file actions ───────────────────────────────────────────────────────
  const currentExample = useMemo(() => EXAMPLE_LIST.find((e) => e.code === code)?.key ?? null, [code]);
  const [lastExample, setLastExample] = useState<string | null>(null);

  const openFile = useCallback(
    (path: string) => {
      actions.open(path);
      if (sidebarFloats) setSidePanel(null);
      requestAnimationFrame(() => editor.current?.focus());
    },
    [actions, sidebarFloats],
  );

  const loadExample = (key: string) => {
    const ex = EXAMPLE_BY_KEY[key];
    replaceCode(ex.code);
    setStdin(ex.stdin ?? "");
    setArgsLine(formatArgs(ex.args ?? []));
    setLastExample(key);
    if (sidebarFloats) setSidePanel(null);
    editor.current?.focus();
  };

  const download = useCallback(
    async (path: string) => {
      const s = latest.current;
      if (isFile(s.files, path)) {
        downloadBlob(new Blob([s.files[path]], { type: "text/plain;charset=utf-8" }), basename(path));
        return;
      }
      // A folder, or "" for the whole project, as a .zip of its contents.
      const prefix = path ? `${path}/` : "";
      const entries: Record<string, string> = {};
      for (const [k, v] of Object.entries(s.files)) if (k.startsWith(prefix)) entries[k.slice(prefix.length)] = v;
      delete entries[""];
      downloadBlob(await zip(entries), `${path ? basename(path) : "biton-project"}.zip`);
    },
    [latest],
  );
  const downloadRef = useRef(download);
  downloadRef.current = download;

  const deleteWithUndo = useCallback(
    (path: string) => {
      const { before, count } = actions.remove(path);
      const what = kindOf(before.files, path) === "folder" ? `${basename(path)} and ${count} file${count === 1 ? "" : "s"}` : basename(path);
      notify({ text: `Deleted ${what}`, action: { label: "Undo", run: () => actions.replace(before) } });
    },
    [actions, notify],
  );

  const moveFile = useCallback(
    (from: string, to: string) => {
      actions.move(from, to);
      if (dirname(from) !== dirname(to)) notify(`Moved to ${dirname(to) || "the top level"}`);
    },
    [actions, notify],
  );

  /** Bring files from the user's computer into `folder`, asking before replacing anything. */
  async function importFiles(picked: Picked[], folder: string) {
    const { entries, skipped } = await readPicked(picked);
    const placed = entries.map((e) => ({ path: joinPath(folder, e.path), content: e.content }));
    const skippedNote = skipped.length ? ` ${skipped.length} skipped (${[...new Set(skipped.map((s) => s.reason))].join(", ")}).` : "";
    if (placed.length === 0) {
      notify({ text: `Nothing imported.${skippedNote}`, tone: "error" });
      return;
    }
    const current = latest.current.files;
    const conflicts = placed.filter((e) => isFile(current, e.path) && current[e.path] !== e.content).map((e) => e.path);
    if (conflicts.length) setAsk({ kind: "import", entries: placed, conflicts, skipped: skipped.length });
    else finishImport(placed, "replace", skippedNote);
  }

  function finishImport(entries: Array<{ path: string; content: string }>, mode: "replace" | "keep-both", note = "") {
    let files = latest.current.files;
    const out: Array<{ path: string; content: string }> = [];
    for (const e of entries) {
      let path = e.path;
      const clash = pathProblem(files, path, "file");
      if (clash && !(mode === "replace" && isFile(files, path))) path = uniquePath(files, path);
      if (pathProblem(files, path, "file") && !isFile(files, path)) continue; // under a file of the same name
      out.push({ path, content: e.content });
      files = { ...files, [path]: e.content };
    }
    actions.writeMany(out);
    const firstSource = out.find((e) => e.path.endsWith(".bit")) ?? out[0];
    if (out.length === 1 || !latest.current.active) actions.open(firstSource.path);
    const limit = serverInfo?.limits.maxProjectBytes;
    const size = Object.values(files).reduce((n, t) => n + new Blob([t]).size, 0);
    const tooBig = limit && size > limit ? ` The project is now over the server's ${Math.round(limit / 1024)} KB limit, so it won't compile until it is smaller.` : "";
    notify({ text: `Imported ${out.length} file${out.length === 1 ? "" : "s"}.${note}${tooBig}`, tone: tooBig ? "error" : undefined });
  }

  /** AI context: the modules the open file imports, trimmed. */
  const aiRelated = useCallback(() => {
    const s = latest.current;
    if (!s.active) return undefined;
    return importsOf(s.files, s.active, s.files[s.active] ?? "")
      .slice(0, AI_MAX_RELATED_FILES)
      .map((path) => ({ path, content: s.files[path].slice(0, AI_MAX_RELATED_CHARS) }));
  }, [latest]);

  const saveNow = useCallback(() => {
    if (persist()) notify("Saved in this browser");
  }, [persist, notify]);

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
            "run                 compile the entry file with the selected -O level and run it",
            "check               type-check the open file (biton --check)",
            "fmt                 format the open file (biton fmt)",
            `emit <kind>         show compiler output: ${EMIT_KINDS.join(" | ")}`,
            "ls                  list the project's files",
            "open <path>         open a file",
            "entry [path]        show or set the file Run starts from",
            "args [arguments]    show or set the program's arguments",
            "opt <O0|O1|O2|O3>   set the optimisation level",
            "theme <light|dark|system>",
            "ai [on|off]         turn inline AI suggestions on or off",
            "share               copy a link to this program (or project)",
            "login / logout      sign in (needed to run programs) / sign out",
            "whoami · version · clear",
            "",
            `${MOD}+Enter run · Esc stop · Shift+Alt+F format · ${MOD}+P go to file · Alt+W close tab · ${MOD}+B explorer · ${MOD}+J panel`,
            "AI: Tab accept · " + MOD + "+→ accept word · Esc dismiss · Alt+\\ suggest now",
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
      case "check": {
        echo();
        const target = latest.current.active;
        if (!isSource(target)) {
          addRow("err", "Open a .bit file to check it.");
          return;
        }
        compile({ ...projectRequest(latest.current.files, target), mode: "check" })
          .then((res) => {
            showDiagnostics(located(res.diagnostics, target), res.compilerOutput);
            addRow("sys", res.success ? `No errors in ${target} (${Math.round(res.compileTimeMs)} ms).` : "Type check failed.");
          })
          .catch((err) => addRow("err", `Request failed: ${err.message}`));
        return;
      }
      case "ls":
        echo();
        addRow("out", listFiles(latest.current.files).map((p) => (p === entry ? `${p}  ← entry` : p)).join("\n") || "(no files)");
        return;
      case "open": {
        echo();
        const path = rest.join(" ");
        if (isFile(latest.current.files, path)) openFile(path);
        else addRow("err", `No file “${path}”. Type “ls” to list them.`);
        return;
      }
      case "entry": {
        echo();
        const path = rest.join(" ");
        if (!path) addRow("sys", entry ? `Run starts from ${entry}.` : "No entry file: create main.bit or choose one.");
        else if (isFile(latest.current.files, path) && path.endsWith(".bit")) {
          actions.setEntry(path);
          addRow("sys", `Run now starts from ${path}.`);
        } else addRow("err", `No .bit file “${path}”.`);
        return;
      }
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
      case "ai": {
        echo();
        if (!aiAvailable) {
          addRow("err", "AI completion is not configured on this server.");
          return;
        }
        const arg = (rest[0] || "").toLowerCase();
        if (arg && arg !== "on" && arg !== "off") {
          addRow("err", "Usage: ai [on|off]");
          return;
        }
        const next = arg ? arg === "on" : !aiEnabled;
        if (next && serverInfo?.ai?.requireSignIn && !auth?.user) {
          setAiEnabled(true);
          setSignIn({ reason: "Sign in to use AI completion." });
          return;
        }
        setAiEnabled(next);
        addRow("sys", next ? "AI suggestions are on: they appear as faint text after a pause; Tab accepts." : "AI suggestions are off.");
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
      const key = e.key.toLowerCase();
      if (mod && e.key === "Enter") {
        e.preventDefault();
        run();
      } else if (e.key === "Escape" && runAbort.current) {
        e.preventDefault();
        stop();
      } else if (e.shiftKey && e.altKey && e.code === "KeyF") {
        e.preventDefault();
        format();
      } else if (mod && !e.shiftKey && key === "s") {
        e.preventDefault();
        saveNow();
      } else if (mod && !e.shiftKey && key === "p") {
        e.preventDefault();
        setQuickOpen(true);
      } else if (e.altKey && !mod && e.code === "KeyW") {
        e.preventDefault();
        if (latest.current.active) actions.closeTabs([latest.current.active]);
      } else if (mod && key === "b") {
        e.preventDefault();
        setSidePanel((p) => (p ? null : dockedPanel.current ?? "files"));
      } else if (mod && key === "j") {
        e.preventDefault();
        setShowPanel((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run, stop, format, saveNow, actions, latest]);

  // After a diagnostic opens another file, jump once that file is in the editor.
  useEffect(() => {
    const j = pendingJump.current;
    if (j && j.path === active) {
      pendingJump.current = null;
      requestAnimationFrame(() => editor.current?.jumpTo(j.line, j.col));
    }
  }, [active]);

  const editorDiagnostics = useMemo(() => (diagnosticsStale ? null : diag.list), [diag.list, diagnosticsStale]);
  const visibleDiagnostics = diag.list;
  const errorCount = visibleDiagnostics.filter((d) => d.severity === "error" || d.severity === "fatal").length;
  const warningCount = visibleDiagnostics.filter((d) => d.severity === "warning").length;
  const problemsByFile = useMemo(() => {
    const m = new Map<string, FileProblems>();
    for (const d of diag.list) {
      if (!d.file || !(d.file in files)) continue;
      const p = m.get(d.file) ?? { errors: 0, warnings: 0 };
      if (d.severity === "error" || d.severity === "fatal") p.errors++;
      else if (d.severity === "warning") p.warnings++;
      m.set(d.file, p);
    }
    return m;
  }, [diag.list, files]);

  const canOpen = (d: Diagnostic) => d.line > 0 && !!d.file && isFile(files, d.file);
  const jump = (d: Diagnostic) => {
    if (!canOpen(d)) return;
    if (d.file === active) editor.current?.jumpTo(d.line, d.col);
    else {
      pendingJump.current = { path: d.file!, line: d.line, col: d.col };
      actions.open(d.file!);
    }
  };

  const exampleTitle =
    (currentExample && EXAMPLE_BY_KEY[currentExample].title) || (lastExample && active && `${EXAMPLE_BY_KEY[lastExample].title} (edited)`) || active || "No file open";
  const stdinLines = stdin === "" ? 0 : stdin.split("\n").length - (stdin.endsWith("\n") ? 1 : 0);
  const argCount = parseArgs(argsLine).length;
  const allFiles = useMemo(() => listFiles(files), [files]);

  const aiAvailable = !!serverInfo?.ai?.enabled;
  const aiActive = aiAvailable && aiEnabled && (!serverInfo?.ai?.requireSignIn || !!auth?.user);
  const toggleAI = () => {
    if (!aiAvailable) return;
    if (serverInfo?.ai?.requireSignIn && !auth?.user) {
      setAiEnabled(true);
      setSignIn({ reason: "Sign in to use AI completion." });
      return;
    }
    setAiEnabled((v) => !v);
  };
  useEffect(() => {
    if (!aiActive) setAiStatus({ state: "idle" });
  }, [aiActive]);

  // ── layout ─────────────────────────────────────────────────────────────
  const editorPane = (
    <div className="flex flex-col h-full min-h-0 bg-[var(--editor-bg)]">
      <EditorTabs
        tabs={tabs}
        active={active}
        entry={entry}
        problems={problemsByFile}
        onSelect={(p) => actions.open(p)}
        onClose={actions.closeTabs}
        onReorder={actions.reorderTabs}
        onReveal={(p) => {
          actions.open(p);
          setSidePanel("files");
          setRevealToken((n) => n + 1);
        }}
        onCopyPath={(p) => void copy(p, "Path copied")}
        trailing={
          <>
            <IconButton label="Undo (Ctrl+Z)" size="sm" onClick={() => editor.current?.undo()} disabled={!undoState.canUndo || !active}>
              <Undo2 className="w-3.5 h-3.5" />
            </IconButton>
            <IconButton label="Redo (Ctrl+Shift+Z)" size="sm" onClick={() => editor.current?.redo()} disabled={!undoState.canRedo || !active}>
              <Redo2 className="w-3.5 h-3.5" />
            </IconButton>
          </>
        }
      />
      {conflict && (
        <div role="alert" className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-line bg-warning-soft text-[12.5px] text-fg">
          <span className="flex-1 min-w-[200px]">This project was changed in another browser tab. Saving is paused until you choose which version to keep.</span>
          <Button size="sm" onClick={() => resolveConflict(true)}>
            Load the other tab's version
          </Button>
          <Button size="sm" variant="primary" onClick={() => resolveConflict(false)}>
            Keep this version
          </Button>
        </div>
      )}
      <div className="relative flex-1 min-h-0">
        <CodeEditor
          ref={editor}
          path={active ?? ""}
          value={code}
          onChange={(path, text) => path && actions.write(path, text)}
          onCursor={setCursor}
          onHistory={setUndoState}
          diagnostics={editorDiagnostics}
          onRun={run}
          onFormat={format}
          onSave={saveNow}
          fontSize={fontSize}
          aiEnabled={aiActive && isSource(active)}
          aiRelated={aiRelated}
          onAIStatus={setAiStatus}
        />
        {active === null && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--editor-bg)] text-center p-6">
            <div className="text-[14px] font-medium text-fg">No file is open</div>
            <div className="text-[12.5px] text-muted leading-relaxed">
              Open one from the explorer, or press <Kbd>{MOD}</Kbd> <Kbd>P</Kbd> to go to a file.
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setQuickOpen(true)} disabled={allFiles.length === 0}>
                Go to file…
              </Button>
              <Button size="sm" variant="primary" onClick={() => actions.create(freshPath(files, "", allFiles.length ? "untitled.bit" : SOURCE_FILE), "file")}>
                <FilePlus2 className="w-3.5 h-3.5" />
                New file
              </Button>
            </div>
          </div>
        )}
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
        {outputTab === "problems" && (
          <Problems diagnostics={visibleDiagnostics} stale={diagnosticsStale} checking={checking} canOpen={canOpen} onSelect={jump} />
        )}
        {outputTab === "pipeline" && <Pipeline emit={emit} code={code} opt={opt} runEmit={runEmit} copy={(t) => copy(t)} />}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-dvh min-h-[420px] bg-bg text-fg overflow-hidden">
      {quickOpen && <QuickOpen files={allFiles} recent={project.recent} onOpen={openFile} onClose={() => setQuickOpen(false)} />}

      {ask?.kind === "import" && (
        <ConfirmDialog
          title={`Replace ${ask.conflicts.length} existing file${ask.conflicts.length === 1 ? "" : "s"}?`}
          description={
            <>
              {ask.conflicts.slice(0, 5).map((c) => (
                <span key={c} className="block font-mono text-fg">
                  {c}
                </span>
              ))}
              {ask.conflicts.length > 5 && <span className="block">and {ask.conflicts.length - 5} more</span>}
              <span className="block mt-2">Replacing overwrites them; keeping both imports the new ones under new names.</span>
            </>
          }
          confirmLabel="Replace"
          destructive
          alternative={{
            label: "Keep both",
            onSelect: () => {
              setAsk(null);
              finishImport(ask.entries, "keep-both");
            },
          }}
          onConfirm={() => {
            const before = latest.current;
            setAsk(null);
            finishImport(ask.entries, "replace");
            notify({ text: `Replaced ${ask.conflicts.length} file(s)`, action: { label: "Undo", run: () => actions.replace(before) } });
          }}
          onClose={() => setAsk(null)}
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
        aiAvailable={aiAvailable}
        aiEnabled={aiActive}
        toggleAI={toggleAI}
        title={exampleTitle}
        projectName={projectName}
        onHome={onHome}
        onRenameProject={onRename}
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
              explorer={{
                files,
                activeFile: active,
                entry,
                problems: problemsByFile,
                revealToken,
                onOpen: openFile,
                onCreate: (path, kind) => actions.create(path, kind),
                onMove: moveFile,
                onDuplicate: (path) => actions.duplicate(path),
                onDelete: deleteWithUndo,
                onSetEntry: (path) => {
                  actions.setEntry(path);
                  notify(`Run now starts from ${path}`);
                },
                onDownload: (path) => void download(path),
                onCopyPath: (path) => void copy(path, "Path copied"),
                onImport: (picked, folder) => void importFiles(picked, folder),
                onError: (message) => notify({ text: message, tone: "error" }),
              }}
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
        diagnostics={diagnosticsStale && isSource(active) ? null : visibleDiagnostics}
        opt={opt}
        cursor={cursor}
        openProblems={() => {
          setShowPanel(true);
          setOutputTab("problems");
        }}
        fontSize={fontSize}
        setFontSize={setFontSize}
        aiEnabled={aiActive}
        aiStatus={aiStatus}
        onAIClick={() => (aiStatus.state === "signin" ? setSignIn({ reason: "Sign in to use AI completion." }) : toggleAI())}
        entry={entry}
        onEntryClick={() => entry && openFile(entry)}
      />

      {toast && (
        <div
          role="status"
          className={cx(
            "fixed bottom-10 left-1/2 -translate-x-1/2 z-50 w-max flex items-center gap-3 pl-3.5 pr-2 min-h-9 py-1.5 max-w-[min(560px,calc(100vw-32px))] rounded-lg text-[13px] font-medium shadow-pop animate-pop",
            toast.tone === "error" ? "bg-danger text-white dark:text-[#1f0606]" : "bg-fg text-bg",
          )}
        >
          <Braces className="w-3.5 h-3.5 opacity-70 shrink-0" />
          <span className="flex-1">{toast.text}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action!.run();
                setToastState(null);
              }}
              className="shrink-0 h-7 px-2.5 rounded-md font-semibold underline-offset-2 hover:underline bg-white/10"
            >
              {toast.action.label}
            </button>
          )}
          {!toast.action && <span className="w-1" />}
        </div>
      )}
    </div>
  );
}
