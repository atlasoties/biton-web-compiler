import { Layers, RefreshCw } from "lucide-react";

import { EMIT_KINDS, type EmitKind, type OptLevel } from "../../../shared/api.ts";
import type { EmitState } from "../../lib/state";

const LABELS: Record<EmitKind, string> = {
  tokens: "Tokens",
  ast: "AST",
  hir: "HIR",
  "typed-hir": "Typed HIR",
  mir: "MIR",
  ir: "LLVM IR",
};

interface InspectorProps {
  emit: EmitState;
  code: string;
  opt: OptLevel;
  runEmit: (kind: EmitKind) => void;
}

/** Shows what each stage of the real compiler pipeline produces (`biton --emit`). */
export default function Inspector({ emit, code, opt, runEmit }: InspectorProps) {
  const stale = emit.text !== null && emit.source !== code;
  return (
    <section className="h-[55%] flex flex-col border-b border-[#6d5f50]/40 bg-[#0c122a] min-h-0">
      <div className="flex items-center justify-between px-3 py-2 bg-[#051139] border-b border-[#6d5f50]/35">
        <div className="flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-[#fec153]" />
          <span className="text-[10px] font-bold text-[#fcd389]/70 uppercase tracking-widest">Compiler pipeline</span>
        </div>
        <button
          onClick={() => runEmit(emit.kind)}
          disabled={emit.loading}
          className="flex items-center gap-1 text-[10px] bg-[#0c122a] border border-[#6d5f50]/40 hover:border-[#ffa500] hover:text-white text-[#fcd389]/75 px-2 py-0.5 rounded font-bold disabled:opacity-60"
          title={`biton --emit ${emit.kind}${emit.kind === "ir" ? ` -${opt}` : ""} main.bit`}
        >
          <RefreshCw className={`w-3 h-3 ${emit.loading ? "animate-spin" : ""}`} />
          {emit.text === null ? "Show" : "Refresh"}
        </button>
      </div>

      <div className="flex flex-wrap gap-1 px-2 py-1.5 border-b border-[#6d5f50]/30 bg-[#051139]/60">
        {EMIT_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => runEmit(k)}
            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-colors ${
              emit.kind === k ? "bg-[#ffa500]/20 text-[#fec153] border border-[#ffa500]/50" : "text-[#fcd389]/60 hover:text-white border border-transparent"
            }`}
          >
            {LABELS[k]}
          </button>
        ))}
      </div>

      <div className="relative flex-1 min-h-0">
        {stale && (
          <div className="absolute top-1 right-3 z-10 text-[9px] font-mono bg-amber-500/15 text-amber-300 border border-amber-500/30 px-1.5 rounded">
            out of date — refresh
          </div>
        )}
        <pre
          className={`h-full overflow-auto p-3 text-[11px] leading-snug font-mono whitespace-pre scrollbar-thin ${
            emit.failed ? "text-red-300" : "text-[#fcd389]/85"
          } ${stale ? "opacity-60" : ""}`}
        >
          {emit.text ??
            "Pick a stage to see what the compiler produces for the editor buffer:\n\n" +
              "  Tokens     lexer output\n" +
              "  AST        parse tree\n" +
              "  HIR        high-level IR\n" +
              "  Typed HIR  HIR after type checking\n" +
              "  MIR        mid-level IR\n" +
              "  LLVM IR    final IR at the selected -O level"}
        </pre>
      </div>
    </section>
  );
}
