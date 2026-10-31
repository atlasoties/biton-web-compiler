import type { Diagnostic, HealthResponse, OptLevel } from "../../../shared/api.ts";

interface FooterProps {
  serverInfo: HealthResponse | null;
  serverError: string | null;
  /** null while the buffer is being re-checked. */
  diagnostics: Diagnostic[] | null;
  opt: OptLevel;
}

export default function Footer({ serverInfo, serverError, diagnostics, opt }: FooterProps) {
  const errors = diagnostics?.filter((d) => d.severity === "error" || d.severity === "fatal").length;
  const warnings = diagnostics?.filter((d) => d.severity === "warning").length;
  const connected = serverInfo && !serverError;

  return (
    <footer className="h-6 bg-[#051139] border-t border-[#6d5f50]/40 text-[#fcd389]/60 flex items-center justify-between px-3 text-[10px] font-semibold shrink-0 font-mono select-none">
      <div className="flex items-center gap-4 min-w-0">
        <div className={`flex items-center gap-1.5 font-bold ${connected ? "text-emerald-400" : "text-red-400"}`} title={serverError ?? undefined}>
          <span>{connected ? "●" : "○"}</span>
          <span className="truncate">{connected ? serverInfo.compilerVersion : "compile server offline"}</span>
        </div>
        {serverInfo && (
          <div className={serverInfo.sandbox === "none" ? "text-amber-400" : "text-[#8d7f70]"}>
            sandbox: {serverInfo.sandbox}
          </div>
        )}
        <div className="text-[#8d7f70]">-{opt}</div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-[#8d7f70]">
          {diagnostics === null ? "checking…" : `errors: ${errors} · warnings: ${warnings}`}
        </div>
        <div className="text-[#8d7f70]">UTF-8 · .bit</div>
      </div>
    </footer>
  );
}
