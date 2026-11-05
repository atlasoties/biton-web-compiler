import { useEffect, useRef, useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";

import type { CompileResponse } from "../../../shared/api.ts";
import type { TerminalRow } from "../../lib/state";
import { IconButton, Kbd, cx } from "../ui";
import { MOD } from "../layout/TopBar";

interface ConsoleProps {
  rows: TerminalRow[];
  clear: () => void;
  onCommand: (cmd: string) => void;
  lastRun: CompileResponse | null;
  running: boolean;
}

const ROW: Record<TerminalRow["type"], string> = {
  cmd: "text-muted",
  out: "text-fg",
  err: "text-danger",
  warn: "text-warning",
  sys: "text-faint",
};

/** Program output and the compiler's messages, with a command line. */
export default function Console({ rows, clear, onCommand, lastRun, running }: ConsoleProps) {
  const scroll = useRef<HTMLDivElement | null>(null);
  const stick = useRef(true);
  const [input, setInput] = useState("");
  const [past, setPast] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);

  // Follow new output, unless the user scrolled up to read.
  useEffect(() => {
    const el = scroll.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [rows]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    setPast((p) => [...p.filter((x) => x !== q), q].slice(-50));
    setCursor(-1);
    setInput("");
    onCommand(q);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" && past.length) {
      e.preventDefault();
      const i = cursor < 0 ? past.length - 1 : Math.max(0, cursor - 1);
      setCursor(i);
      setInput(past[i]);
    } else if (e.key === "ArrowDown" && cursor >= 0) {
      e.preventDefault();
      const i = cursor + 1;
      if (i >= past.length) {
        setCursor(-1);
        setInput("");
      } else {
        setCursor(i);
        setInput(past[i]);
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      clear();
    }
  };

  const r = lastRun?.run;
  const status = r ? (r.timedOut ? "timed out" : r.signal ? r.signal : `exit ${r.exitCode}`) : null;
  const bad = r ? r.timedOut || !!r.signal : false;

  return (
    <div className="flex flex-col h-full min-h-0 bg-surface">
      <div className="h-9 shrink-0 flex items-center gap-2 px-3 border-b border-line text-[11.5px]">
        {running ? (
          <span className="flex items-center gap-1.5 text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Running…
          </span>
        ) : r ? (
          <>
            <span className={cx("inline-flex items-center gap-1.5 font-medium", bad ? "text-danger" : r.exitCode === 0 ? "text-success" : "text-warning")}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {status}
            </span>
            <span className="text-faint">·</span>
            <span className="text-muted tabular-nums">compile {Math.round(lastRun!.compileTimeMs)} ms</span>
            <span className="text-faint">·</span>
            <span className="text-muted tabular-nums">run {Math.round(r.runTimeMs)} ms</span>
          </>
        ) : (
          <span className="text-faint">
            Press <Kbd>{MOD}</Kbd> <Kbd>Enter</Kbd> to run
          </span>
        )}
        <div className="flex-1" />
        <IconButton label="Clear console (Ctrl+L)" size="sm" onClick={clear}>
          <Trash2 className="w-3.5 h-3.5" />
        </IconButton>
      </div>

      <div
        ref={scroll}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 font-mono text-[12.5px] leading-[1.6]"
        role="log"
        aria-live="polite"
      >
        {rows.length === 0 && <div className="text-faint">Output appears here.</div>}
        {rows.map((row, i) =>
          row.type === "cmd" ? (
            <div key={i} className={cx("flex gap-2 pt-2 first:pt-0", ROW.cmd)}>
              <ChevronRight className="w-3.5 h-3.5 mt-[3px] shrink-0 text-accent" />
              <span className="whitespace-pre-wrap break-all">{row.text}</span>
            </div>
          ) : (
            <div key={i} className={cx("whitespace-pre-wrap break-words", ROW[row.type], row.type === "sys" && "font-sans text-[12px]")}>
              {row.text}
            </div>
          ),
        )}
      </div>

      <form onSubmit={submit} className="shrink-0 flex items-center gap-2 h-9 px-3 border-t border-line">
        <ChevronRight className="w-3.5 h-3.5 text-accent shrink-0" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="run · check · fmt · emit ir · args … · help"
          className="flex-1 min-w-0 bg-transparent outline-none font-mono text-[12.5px] text-fg placeholder:text-faint"
          aria-label="Console command"
          spellCheck={false}
          autoComplete="off"
        />
      </form>
    </div>
  );
}
