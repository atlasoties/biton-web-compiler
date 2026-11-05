import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle } from "lucide-react";

import type { Diagnostic } from "../../../shared/api.ts";
import { cx } from "../ui";

interface ProblemsProps {
  diagnostics: Diagnostic[];
  stale: boolean;
  checking: boolean;
  /** Whether a diagnostic points at a project file that can be opened. */
  canOpen: (d: Diagnostic) => boolean;
  onSelect: (d: Diagnostic) => void;
}

/** The compiler's diagnostics for the open file and what it imports, from `biton --check` as you type. */
export default function Problems({ diagnostics, stale, checking, canOpen, onSelect }: ProblemsProps) {
  if (diagnostics.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 bg-surface text-center p-6">
        {checking || stale ? <Loader2 className="w-6 h-6 text-faint animate-spin" /> : <CheckCircle2 className="w-7 h-7 text-success" />}
        <div className="text-[13px] font-medium text-fg">{checking || stale ? "Checking…" : "No problems"}</div>
        <p className="text-[12px] text-faint max-w-[260px]">
          The code is type-checked with <code className="font-mono">biton --check</code> as you type.
        </p>
      </div>
    );
  }
  return (
    <div className={cx("h-full overflow-y-auto bg-surface py-1 transition-opacity", stale && "opacity-60")}>
      {diagnostics.map((d, i) => {
        const err = d.severity === "error" || d.severity === "fatal";
        const warn = d.severity === "warning";
        const Icon = err ? XCircle : warn ? AlertTriangle : Info;
        const clickable = canOpen(d);
        return (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(d)}
            disabled={!clickable}
            className={cx("w-full text-left flex gap-2.5 px-3 py-2 border-b border-line last:border-0", clickable ? "hover:bg-hover" : "cursor-default")}
          >
            <Icon className={cx("w-4 h-4 mt-0.5 shrink-0", err ? "text-danger" : warn ? "text-warning" : "text-info")} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] text-fg break-words">{d.message}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-faint font-mono">
                {d.code && <span>{d.code}</span>}
                {d.line > 0 && (
                  <span>
                    {d.file ?? "?"}:{d.line}:{d.col}
                  </span>
                )}
              </div>
              {d.notes.map((n, j) => (
                <div key={j} className="text-[12px] text-muted mt-1 font-mono break-words">
                  {n}
                </div>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
