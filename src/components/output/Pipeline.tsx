import { Copy, RefreshCw } from "lucide-react";

import { EMIT_KINDS, type EmitKind, type OptLevel } from "../../../shared/api.ts";
import type { EmitState } from "../../lib/state";
import { Button, IconButton, cx } from "../ui";

const LABELS: Record<EmitKind, { label: string; desc: string }> = {
  tokens: { label: "Tokens", desc: "lexer output" },
  ast: { label: "AST", desc: "parse tree" },
  hir: { label: "HIR", desc: "high-level IR" },
  "typed-hir": { label: "Typed HIR", desc: "HIR after type checking" },
  mir: { label: "MIR", desc: "mid-level IR" },
  ir: { label: "LLVM IR", desc: "final IR at the selected -O level" },
};

interface PipelineProps {
  emit: EmitState;
  code: string;
  opt: OptLevel;
  runEmit: (kind: EmitKind) => void;
  copy: (text: string) => void;
}

/** What each stage of the real compiler pipeline produces (`biton --emit`). */
export default function Pipeline({ emit, code, opt, runEmit, copy }: PipelineProps) {
  const stale = emit.text !== null && emit.source !== code;
  return (
    <div className="flex flex-col h-full min-h-0 bg-surface">
      <div className="shrink-0 flex items-center gap-1 px-2 h-10 border-b border-line overflow-x-auto">
        <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-surface-2">
          {EMIT_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => runEmit(k)}
              title={`biton --emit ${k}${k === "ir" ? ` -${opt}` : ""}: ${LABELS[k].desc}`}
              className={cx(
                "h-7 px-2.5 rounded text-[12px] font-medium whitespace-nowrap transition-colors",
                emit.kind === k && emit.text !== null ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {LABELS[k].label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        {stale && <span className="text-[11px] text-warning whitespace-nowrap px-1">out of date</span>}
        {emit.text !== null && (
          <>
            <IconButton label="Copy" size="sm" onClick={() => copy(emit.text!)}>
              <Copy className="w-3.5 h-3.5" />
            </IconButton>
            <IconButton label="Refresh" size="sm" onClick={() => runEmit(emit.kind)} disabled={emit.loading}>
              <RefreshCw className={cx("w-3.5 h-3.5", emit.loading && "animate-spin")} />
            </IconButton>
          </>
        )}
      </div>
      {emit.text === null ? (
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-[12.5px] text-muted mb-3">See what each stage of the compiler produces for your code.</p>
          <div className="grid grid-cols-1 gap-1.5">
            {EMIT_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => runEmit(k)}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-line hover:border-line-strong hover:bg-hover text-left"
              >
                <span className="text-[13px] font-medium text-fg">{LABELS[k].label}</span>
                <span className="text-[12px] text-faint">{LABELS[k].desc}</span>
              </button>
            ))}
          </div>
          {emit.loading && (
            <Button variant="ghost" size="sm" className="mt-3" disabled>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Compiling…
            </Button>
          )}
        </div>
      ) : (
        <pre
          className={cx(
            "flex-1 min-h-0 overflow-auto p-3 font-mono text-[12px] leading-[1.55] whitespace-pre",
            emit.failed ? "text-danger" : "text-fg",
            (stale || emit.loading) && "opacity-60",
          )}
        >
          {emit.text}
        </pre>
      )}
    </div>
  );
}
