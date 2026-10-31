import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Header from "./components/layout/Header";
import Sidebar from "./components/layout/Sidebar";
import Inspector from "./components/layout/Inspector";
import RightPanel from "./components/layout/RightPanel";
import Footer from "./components/layout/Footer";
import Editor from "./components/editor/Editor";
import type { TerminalRow, TerminalRowType } from "./components/editor/Terminal";

import { DEMOS, DEFAULT_DEMO } from "./demos";
import { RateLimitError, compile, compileWithRetry, health, isAbort } from "./lib/api";
import { useHistory } from "./lib/useHistory";
import { SOURCE_FILE, inBuffer, type Busy, type EmitState } from "./lib/state";
import {
  EMIT_KINDS,
  type CompileResponse,
  type Diagnostic,
  type EmitKind,
  type HealthResponse,
  type OptLevel,
} from "../shared/api.ts";

const LIVE_CHECK_DELAY_MS = 700;
const MAX_TERMINAL_ROWS = 500;

export default function App() {
  const history = useHistory(DEMOS[DEFAULT_DEMO].code);
  const code = history.value;
  const codeRef = useRef(code);
  codeRef.current = code;

  const [opt, setOpt] = useState<OptLevel>("O2");
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

  const [terminalRows, setTerminalRows] = useState<TerminalRow[]>([
    { type: "sys", text: "Biton web compiler. Programs are compiled to native code by the real biton compiler." },
    { type: "sys", text: "Type 'help' for terminal commands, or press Run (Ctrl+Enter)." },
  ]);
  const [terminalInput, setTerminalInput] = useState("");

  const checkAbort = useRef<AbortController | null>(null);
  const runAbort = useRef<AbortController | null>(null);
  const emitAbort = useRef<AbortController | null>(null);

  const addRow = useCallback((type: TerminalRowType, text: string) => {
    setTerminalRows((rows) => {
      const next = [...rows, { type, text }];
      return next.length > MAX_TERMINAL_ROWS ? next.slice(next.length - MAX_TERMINAL_ROWS) : next;
    });
  }, []);

  // ── server health ──────────────────────────────────────────────────────
  useEffect(() => {
    const ac = new AbortController();
    health(ac.signal)
      .then((h) => {
        setServerInfo(h);
        setServerError(null);
        if (h.sandbox === "none") {
          addRow("sys", "Note: the compile server is running programs without a sandbox.");
        }
      })
      .catch((e) => {
        if (isAbort(e)) return;
        setServerError(e.message);
        addRow("err", `Cannot reach the compile server: ${e.message}. Start it with \`npm run server\`.`);
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
        const res = await compile({ code, mode: "check" }, ac.signal);
        if (codeRef.current !== code) return; // edited since; a newer check is coming
        setDiagnostics(res.diagnostics);
        setDiagnosticsSource(code);
      } catch (e) {
        if (e instanceof RateLimitError) {
          // Quietly try again once the server allows it.
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

  // ── run ────────────────────────────────────────────────────────────────
  const run = useCallback(async () => {
    runAbort.current?.abort();
    checkAbort.current?.abort();
    const ac = new AbortController();
    runAbort.current = ac;
    const source = codeRef.current;
    setBusy("run");
    addRow("cmd", `biton -${opt} ${SOURCE_FILE} && ./${SOURCE_FILE.replace(/\.bit$/, "")}`);

    try {
      const res = await compileWithRetry({ code: source, mode: "run", opt }, ac.signal);
      setServerError(null);
      setLastRun(res);
      if (codeRef.current === source) {
        setDiagnostics(res.diagnostics);
        setDiagnosticsSource(source);
      }

      const errors = res.diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal");
      const warnings = res.diagnostics.filter((d) => d.severity === "warning");
      for (const d of res.diagnostics) addRow(d.severity === "warning" ? "warn" : "err", d.rendered);
      if (res.compilerOutput) addRow("err", res.compilerOutput);

      if (res.failedAt === "compile") {
        addRow("sys", `Compilation failed: ${errors.length} error(s), ${warnings.length} warning(s) in ${res.compileTimeMs} ms.`);
        return;
      }
      addRow("sys", `Compiled in ${res.compileTimeMs} ms${warnings.length ? ` with ${warnings.length} warning(s)` : ""}.`);

      const r = res.run!;
      if (r.stdout) addRow("out", r.stdout.replace(/\n$/, ""));
      if (r.stderr) addRow("err", r.stderr.replace(/\n$/, ""));
      if (r.truncated) addRow("err", "Output limit reached; the program was stopped.");
      if (r.timedOut) {
        addRow("err", `Program timed out after ${serverInfo?.limits.runTimeoutMs ?? "?"} ms and was killed.`);
      } else if (r.signal) {
        addRow("err", `Program terminated by ${r.signal} after ${r.runTimeMs} ms.`);
      } else {
        addRow("sys", `Program exited with code ${r.exitCode} after ${r.runTimeMs} ms.`);
      }
    } catch (e) {
      if (isAbort(e)) return;
      const msg = (e as Error).message;
      if (e instanceof RateLimitError) {
        addRow("err", `Slow down: ${msg}.`);
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
  }, [opt, addRow, serverInfo]);

  // ── emit (inspector) ───────────────────────────────────────────────────
  const runEmit = useCallback(
    async (kind: EmitKind) => {
      emitAbort.current?.abort();
      const ac = new AbortController();
      emitAbort.current = ac;
      const source = codeRef.current;
      setEmit((s) => ({ ...s, kind, loading: true }));
      try {
        const res = await compileWithRetry({ code: source, mode: "emit", emit: kind, opt }, ac.signal);
        const failed = !res.success;
        const text = failed
          ? [...res.diagnostics.map((d) => d.rendered), res.compilerOutput].filter(Boolean).join("\n\n") ||
            "compilation failed"
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

  // ── editor actions ─────────────────────────────────────────────────────
  const loadDemo = (key: string) => {
    history.set(DEMOS[key].code, true);
    addRow("sys", `Loaded example "${DEMOS[key].title}".`);
  };

  const reset = () => {
    runAbort.current?.abort();
    history.set(DEMOS[DEFAULT_DEMO].code, true);
    setLastRun(null);
    setEmit((s) => ({ ...s, text: null, source: null, failed: false }));
    addRow("sys", "Editor reset to the basics example.");
  };

  const downloadCode = () => {
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = SOURCE_FILE;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const uploadCode = (name: string, text: string) => {
    history.set(text, true);
    addRow("sys", `Loaded ${name}.`);
  };

  const undo = () => {
    if (!history.undo()) addRow("sys", "Nothing to undo.");
  };
  const redo = () => {
    if (!history.redo()) addRow("sys", "Nothing to redo.");
  };

  // ── terminal ───────────────────────────────────────────────────────────
  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = terminalInput.trim();
    if (!query) return;
    setTerminalInput("");
    const [cmd, ...args] = query.split(/\s+/);

    switch (cmd.toLowerCase()) {
      case "clear":
        setTerminalRows([]);
        return;
      case "help":
        addRow("cmd", query);
        addRow(
          "sys",
          [
            "Commands:",
            "  run                 compile with the selected -O level and run",
            "  check               type-check only (biton --check)",
            `  emit <kind>         print compiler output: ${EMIT_KINDS.join(" | ")}`,
            "  opt <O0|O1|O2|O3>   set the optimisation level",
            "  version             show the compiler version",
            "  clear               clear this terminal",
            "",
            "Shortcuts: Ctrl+Enter run · Ctrl+Z undo · Ctrl+Y / Ctrl+Shift+Z redo",
          ].join("\n"),
        );
        return;
      case "run":
        run();
        return;
      case "check":
        addRow("cmd", query);
        compile({ code, mode: "check" })
          .then((res) => {
            if (codeRef.current === code) {
              setDiagnostics(res.diagnostics);
              setDiagnosticsSource(code);
            }
            for (const d of res.diagnostics) addRow(d.severity === "warning" ? "warn" : "err", d.rendered);
            if (res.compilerOutput) addRow("err", res.compilerOutput);
            addRow("sys", res.success ? `No errors (${res.compileTimeMs} ms).` : "Type check failed.");
          })
          .catch((err) => addRow("err", `Request failed: ${err.message}`));
        return;
      case "emit": {
        addRow("cmd", query);
        const kind = args[0] as EmitKind;
        if (!EMIT_KINDS.includes(kind)) {
          addRow("err", `Usage: emit <${EMIT_KINDS.join("|")}>`);
          return;
        }
        runEmit(kind);
        addRow("sys", `Showing --emit ${kind} in the inspector.`);
        return;
      }
      case "opt": {
        addRow("cmd", query);
        const level = (args[0] || "").toUpperCase().replace(/^-/, "");
        if (!["O0", "O1", "O2", "O3"].includes(level)) {
          addRow("err", "Usage: opt <O0|O1|O2|O3>");
          return;
        }
        setOpt(level as OptLevel);
        addRow("sys", `Optimisation level set to -${level}.`);
        return;
      }
      case "version":
        addRow("cmd", query);
        addRow("sys", serverInfo ? serverInfo.compilerVersion : `Compile server unavailable${serverError ? `: ${serverError}` : ""}.`);
        return;
      default:
        addRow("cmd", query);
        addRow("err", `Unknown command '${cmd}'. Type 'help' for the list. Biton is compiled, so expressions cannot be evaluated here.`);
    }
  };

  // Ctrl+Enter runs from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        run();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);

  const diagnosticsStale = diagnosticsSource !== code;
  const markedLines = useMemo(() => {
    const m = new Map<number, "error" | "warning">();
    if (diagnosticsStale) return m;
    for (const d of diagnostics) {
      if (!inBuffer(d)) continue;
      if (d.severity === "error" || d.severity === "fatal") m.set(d.line, "error");
      else if (d.severity === "warning" && !m.has(d.line)) m.set(d.line, "warning");
    }
    return m;
  }, [diagnostics, diagnosticsStale]);

  const [jumpTo, setJumpTo] = useState<{ line: number; col: number; seq: number } | null>(null);
  const jump = (d: Diagnostic) => {
    if (inBuffer(d)) setJumpTo((j) => ({ line: d.line, col: d.col, seq: (j?.seq ?? 0) + 1 }));
  };

  return (
    <div className="flex flex-col h-screen min-h-[640px] bg-[#0c122a] text-[#fcd389]/90 font-sans selection:bg-[#ffa500]/20 overflow-hidden">
      <Header busy={busy} run={run} opt={opt} setOpt={setOpt} reset={reset} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar demos={DEMOS} loadDemo={loadDemo} downloadCode={downloadCode} uploadCode={uploadCode} />

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Editor
            fileName={SOURCE_FILE}
            code={code}
            setCode={(v) => history.set(v, false)}
            lastRun={lastRun}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            undo={undo}
            redo={redo}
            markedLines={markedLines}
            jumpTo={jumpTo}
            terminalRows={terminalRows}
            setTerminalRows={setTerminalRows}
            terminalInput={terminalInput}
            setTerminalInput={setTerminalInput}
            handleTerminalSubmit={handleTerminalSubmit}
          />
        </main>

        <aside className="w-96 bg-[#051139] border-l border-[#6d5f50]/40 flex flex-col shrink-0 overflow-hidden">
          <Inspector emit={emit} code={code} opt={opt} runEmit={runEmit} />
          <RightPanel
            diagnostics={diagnostics}
            stale={diagnosticsStale}
            checking={checking}
            lastRun={lastRun}
            onSelect={jump}
          />
        </aside>
      </div>

      <Footer
        serverInfo={serverInfo}
        serverError={serverError}
        diagnostics={diagnosticsStale ? null : diagnostics}
        opt={opt}
      />
    </div>
  );
}
