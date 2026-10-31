import { Play, RefreshCw, RotateCcw } from "lucide-react";

import { OPT_LEVELS, type OptLevel } from "../../../shared/api.ts";
import type { Busy } from "../../lib/state";

interface HeaderProps {
  busy: Busy;
  run: () => void;
  opt: OptLevel;
  setOpt: (o: OptLevel) => void;
  reset: () => void;
}

export default function Header({ busy, run, opt, setOpt, reset }: HeaderProps) {
  const running = busy === "run";
  return (
    <header className="flex items-center justify-between px-4 py-3 bg-[#051139] border-b border-[#6d5f50]/40 shrink-0">
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 shrink-0">
          <svg viewBox="0 0 100 110" className="w-full h-full" aria-hidden="true">
            <polygon points="50,5 93,30 93,80 50,105 7,80 7,30" fill="#0c122a" stroke="#ffa500" strokeWidth="2.5" />
            <line x1="50" y1="23" x2="50" y2="48" stroke="#fec153" strokeWidth="5.5" strokeLinecap="round" />
            <path d="M 23,50 L 37,50 L 50,76 L 63,50 L 77,50" fill="none" stroke="#fdcc74" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M 40,56 L 50,75 L 60,56" fill="none" stroke="#ffba3c" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <h1 className="text-sm font-extrabold tracking-widest text-white uppercase">
            biton <span className="text-[#fec153]">Web Compiler</span>
          </h1>
          <p className="text-[10px] text-[#fcd389]/60 tracking-wide mt-0.5 font-mono">
            a small, statically-typed systems language · LLVM backend
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#fcd389]/70" title="Optimisation level passed to biton">
          OPT
          <select
            value={opt}
            onChange={(e) => setOpt(e.target.value as OptLevel)}
            className="bg-[#0c122a] border border-[#6d5f50]/40 rounded px-1.5 py-1 text-xs text-[#fcd389] font-mono outline-none focus:border-[#ffa500]"
          >
            {OPT_LEVELS.map((o) => (
              <option key={o} value={o}>
                -{o}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={run}
          disabled={running}
          className="px-4 py-1.5 bg-[#ffa500] hover:bg-[#ffba3c] active:bg-[#fec153] text-[#051139] disabled:opacity-75 rounded text-xs font-black flex items-center gap-2 transition-all shadow-md shadow-[#ffa500]/20"
          title="Compile and run (Ctrl+Enter)"
        >
          {running ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin stroke-[#051139]" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-[#051139] stroke-[#051139]" />
          )}
          <span>{running ? "RUNNING..." : "RUN"}</span>
        </button>

        <button
          onClick={reset}
          className="p-1.5 bg-[#0c122a] border border-[#6d5f50]/40 hover:border-[#ffa500] rounded text-[#fcd389]/70 hover:text-white transition-colors"
          title="Reset the editor to the basics example"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
