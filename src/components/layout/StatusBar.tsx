import { AlertTriangle, ShieldAlert, XCircle } from "lucide-react";

import type { Diagnostic, HealthResponse, OptLevel } from "../../../shared/api.ts";
import type { CursorInfo } from "../../editor/CodeEditor";
import { cx } from "../ui";

interface StatusBarProps {
  serverInfo: HealthResponse | null;
  serverError: string | null;
  /** null while the buffer is being re-checked. */
  diagnostics: Diagnostic[] | null;
  opt: OptLevel;
  cursor: CursorInfo;
  openProblems: () => void;
  fontSize: number;
  setFontSize: (n: number) => void;
}

const item = "h-full px-2 flex items-center gap-1.5 hover:bg-hover hover:text-fg transition-colors whitespace-nowrap";

export default function StatusBar(p: StatusBarProps) {
  const errors = p.diagnostics?.filter((d) => d.severity === "error" || d.severity === "fatal").length ?? 0;
  const warnings = p.diagnostics?.filter((d) => d.severity === "warning").length ?? 0;
  const connected = !!p.serverInfo && !p.serverError;
  return (
    <footer className="h-6 shrink-0 flex items-center justify-between border-t border-line bg-surface text-[11.5px] text-muted select-none">
      <div className="flex items-center h-full min-w-0">
        <span className={cx(item, "cursor-default")} title={p.serverError ?? p.serverInfo?.compilerVersion}>
          <span className={cx("w-2 h-2 rounded-full", connected ? "bg-success" : "bg-danger")} />
          <span className="truncate">{connected ? p.serverInfo!.compilerVersion : "offline"}</span>
        </span>
        {p.serverInfo?.sandbox === "none" && (
          <span className={cx(item, "text-warning cursor-default hidden sm:flex")} title="The server runs programs without a sandbox (development)">
            <ShieldAlert className="w-3.5 h-3.5" />
            no sandbox
          </span>
        )}
        <button className={item} onClick={p.openProblems} title="Problems">
          <XCircle className={cx("w-3.5 h-3.5", errors > 0 && "text-danger")} />
          <span className="tabular-nums">{p.diagnostics === null ? "…" : errors}</span>
          <AlertTriangle className={cx("w-3.5 h-3.5 ml-1", warnings > 0 && "text-warning")} />
          <span className="tabular-nums">{p.diagnostics === null ? "…" : warnings}</span>
        </button>
      </div>
      <div className="flex items-center h-full">
        <span className={cx(item, "cursor-default tabular-nums")}>
          Ln {p.cursor.line}, Col {p.cursor.col}
          {p.cursor.selected > 0 && ` (${p.cursor.selected} selected)`}
        </span>
        <span className={cx(item, "cursor-default hidden md:flex")}>Spaces: 4</span>
        <span className={cx(item, "hidden md:flex")}>
          <button onClick={() => p.setFontSize(p.fontSize - 1)} aria-label="Smaller text" className="px-1 hover:text-fg">
            A−
          </button>
          <span className="tabular-nums">{p.fontSize}px</span>
          <button onClick={() => p.setFontSize(p.fontSize + 1)} aria-label="Larger text" className="px-1 hover:text-fg">
            A+
          </button>
        </span>
        <span className={cx(item, "cursor-default hidden sm:flex")}>UTF-8</span>
        <span className={cx(item, "cursor-default font-mono")}>-{p.opt}</span>
        <span className={cx(item, "cursor-default")}>Biton</span>
      </div>
    </footer>
  );
}
