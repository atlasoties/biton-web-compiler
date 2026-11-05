import { AlertTriangle, Loader2, Play, ShieldAlert, WandSparkles, XCircle } from "lucide-react";

import type { Diagnostic, HealthResponse, OptLevel } from "../../../shared/api.ts";
import type { AIStatus } from "../../editor/ai";
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
  aiEnabled: boolean;
  aiStatus: AIStatus;
  onAIClick: () => void;
  /** The file Run starts from. */
  entry: string | null;
  onEntryClick: () => void;
}

function aiLabel(s: AIStatus): { text: string; title: string; tone?: "warning" | "danger" } {
  switch (s.state) {
    case "loading":
      return { text: "AI", title: "Asking for a suggestion…" };
    case "suggesting":
      return { text: "Tab to accept", title: "Tab accepts the suggestion, Ctrl/⌘+→ one word, Esc dismisses it" };
    case "signin":
      return { text: "AI: sign in", title: "Sign in to use AI suggestions", tone: "warning" };
    case "limited":
      return { text: "AI: paused", title: `AI rate limit reached; suggestions resume in about ${s.retryAfter} s`, tone: "warning" };
    case "error":
      return { text: "AI: unavailable", title: s.message, tone: "danger" };
    default:
      return { text: "AI", title: "Inline AI suggestions are on (Alt+\\ asks now). Click to turn off." };
  }
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
        {p.entry && (
          <button className={cx(item, "hidden sm:flex min-w-0")} onClick={p.onEntryClick} title={`Run starts from ${p.entry}`}>
            <Play className="w-3 h-3 text-run fill-current shrink-0" />
            <span className="truncate max-w-[180px]">{p.entry}</span>
          </button>
        )}
      </div>
      <div className="flex items-center h-full">
        {p.aiEnabled &&
          (() => {
            const ai = aiLabel(p.aiStatus);
            return (
              <button
                className={cx(item, "hidden sm:flex", ai.tone === "warning" && "text-warning", ai.tone === "danger" && "text-danger")}
                title={ai.title}
                onClick={p.onAIClick}
              >
                {p.aiStatus.state === "loading" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <WandSparkles className="w-3.5 h-3.5" />}
                {ai.text}
              </button>
            );
          })()}
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
