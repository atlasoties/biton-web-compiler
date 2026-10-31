import { AlertTriangle, Check, Info, Loader2, XCircle } from "lucide-react";

import type { CompileResponse, Diagnostic } from "../../../shared/api.ts";
import { SOURCE_FILE, inBuffer } from "../../lib/state";

interface RightPanelProps {
  diagnostics: Diagnostic[];
  /** The buffer changed since these diagnostics were produced. */
  stale: boolean;
  checking: boolean;
  lastRun: CompileResponse | null;
  onSelect: (d: Diagnostic) => void;
}

export default function RightPanel({ diagnostics, stale, checking, lastRun, onSelect }: RightPanelProps) {
  const errors = diagnostics.filter((d) => d.severity === "error" || d.severity === "fatal").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-[#0c122a] min-h-0 scrollbar-thin">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-extrabold text-[#fcd389]/50 uppercase tracking-widest font-mono flex items-center gap-1.5">
            Diagnostics
            {(checking || stale) && <Loader2 className="w-3 h-3 animate-spin text-[#fcd389]/40" aria-label="checking" />}
          </div>
          <div className="flex gap-1">
            {errors > 0 && (
              <span className="text-[10px] bg-red-950/40 text-red-400 border border-red-500/35 px-1.5 rounded font-mono">{errors} error{errors > 1 ? "s" : ""}</span>
            )}
            {warnings > 0 && (
              <span className="text-[10px] bg-amber-950/40 text-amber-300 border border-amber-500/35 px-1.5 rounded font-mono">{warnings} warning{warnings > 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        <div className={`space-y-2 transition-opacity ${stale ? "opacity-50" : ""}`}>
          {diagnostics.length === 0 ? (
            <div className="bg-[#051139] border border-[#6d5f50]/40 p-3 rounded flex items-start gap-2.5">
              <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-[#fcd389]/80">{stale ? "Checking…" : "No problems"}</div>
                <p className="text-[10px] text-[#fcd389]/50 mt-0.5 leading-relaxed">
                  The buffer is type-checked with <code className="font-mono">biton --check</code> as you type.
                </p>
              </div>
            </div>
          ) : (
            diagnostics.map((d, idx) => <DiagnosticCard key={idx} d={d} onSelect={onSelect} />)
          )}
        </div>

        {lastRun?.run && <RunSummary res={lastRun} />}
      </div>
    </div>
  );
}

function DiagnosticCard({ d, onSelect }: { d: Diagnostic; onSelect: (d: Diagnostic) => void }) {
  const isError = d.severity === "error" || d.severity === "fatal";
  const isWarning = d.severity === "warning";
  const Icon = isError ? XCircle : isWarning ? AlertTriangle : Info;
  const tone = isError
    ? "border-red-500 bg-red-950/15 text-red-400"
    : isWarning
      ? "border-amber-400 bg-amber-950/15 text-amber-300"
      : "border-sky-400 bg-sky-950/15 text-sky-300";
  const clickable = inBuffer(d);
  return (
    <button
      type="button"
      onClick={() => onSelect(d)}
      disabled={!clickable}
      className={`w-full text-left p-2.5 rounded border-l-2 border border-white/5 ${tone} ${clickable ? "hover:bg-white/5 cursor-pointer" : "cursor-default"}`}
      title={clickable ? "Go to this location" : undefined}
    >
      <div className="flex justify-between items-center mb-1 gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
          <Icon className="w-3 h-3" />
          {d.severity}
          {d.code && <span className="font-mono text-[#fcd389]/50 normal-case">[{d.code}]</span>}
        </span>
        {d.line > 0 && (
          <span className="text-[9px] text-[#fcd389]/50 font-mono shrink-0">
            {d.file && d.file !== SOURCE_FILE ? `${d.file}:` : ""}
            {d.line}:{d.col}
          </span>
        )}
      </div>
      <p className="text-[11px] text-[#fcd389]/85 leading-normal font-mono break-words">{d.message}</p>
      {d.notes.map((n, i) => (
        <p key={i} className="text-[10px] text-[#fcd389]/55 leading-normal font-mono mt-0.5 break-words">
          {n}
        </p>
      ))}
    </button>
  );
}

function RunSummary({ res }: { res: CompileResponse }) {
  const r = res.run!;
  const status = r.timedOut ? "timed out" : r.signal ? r.signal : `exit ${r.exitCode}`;
  const bad = r.timedOut || !!r.signal;
  return (
    <div className="pt-3 border-t border-[#6d5f50]/30 space-y-2">
      <div className="text-[10px] font-bold text-[#fcd389]/50 uppercase font-mono tracking-widest">Last run</div>
      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
        <Stat label="RESULT" value={status} tone={bad ? "text-red-400" : r.exitCode === 0 ? "text-emerald-400" : "text-[#fec153]"} />
        <Stat label="COMPILE" value={`${Math.round(res.compileTimeMs)} ms`} />
        <Stat label="RUN" value={`${Math.round(r.runTimeMs)} ms`} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "text-[#fec153]" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-[#051139] border border-[#6d5f50]/40 p-2 rounded">
      <div className="text-[#fcd389]/50 font-bold">{label}</div>
      <div className={`text-xs font-bold mt-0.5 truncate ${tone}`}>{value}</div>
    </div>
  );
}
