import { Play, RefreshCw, Video } from "lucide-react";
import React from "react";

interface HeaderProps {
  animating: boolean;
  setAnimating: (animating: boolean) => void;
  executeProgram: () => void;
  compilingServer: boolean;
  updateCodeWithHistory: (code: string, immediate: boolean) => void;
  DEMO_SCRIPTS: Record<string, { title: string; desc: string; code: string }>;
  setConsoleLogs: React.Dispatch<React.SetStateAction<string[]>>;
  setEnvironmentVariables: React.Dispatch<React.SetStateAction<any[]>>;
  setExecutionTime: React.Dispatch<React.SetStateAction<number | null>>;
  addTerminalRow: (type: "cmd" | "out" | "err" | "sys", text: string) => void;
}

export default function Header({
  animating,
  setAnimating,
  executeProgram,
  compilingServer,
  updateCodeWithHistory,
  DEMO_SCRIPTS,
  setConsoleLogs,
  setEnvironmentVariables,
  setExecutionTime,
  addTerminalRow,
}: HeaderProps) {
  return (
    <>
      {/* 1. Header Area with λ Indicator / Hexagon Brand Logo */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-700 shrink-0" id="header-bar-biton">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 shrink-0 animate-fade-in" id="biton-logo-wrapper">
            <svg viewBox="0 0 100 110" className="w-full h-full" referrerPolicy="no-referrer">
              {/* Deep midnight navy hexagon matching the brand logo color spec */}
              <polygon points="50,5 93,30 93,80 50,105 7,80 7,30" fill="#0c122a" stroke="#ffa500" strokeWidth="2.5" />
              
              {/* Dynamic golden brand markings inside */}
              {/* Vertical accent pointing down */}
              <line x1="50" y1="23" x2="50" y2="48" stroke="#fec153" strokeWidth="5.5" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 8px rgba(254,193,83,0.4))" }} />
              
              {/* Outer Wave / dipping chevron */}
              <path d="M 23,50 L 37,50 L 50,76 L 63,50 L 77,50" fill="none" stroke="#fdcc74" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              
              {/* Inner chevron */}
              <path d="M 40,56 L 50,75 L 60,56" fill="none" stroke="#ffba3c" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-extrabold tracking-widest text-white uppercase font-sans">biton <span className="text-amber-400">Standard Compiler</span></h1>
              <span className="text-[10px] bg-slate-900 border border-slate-700 px-2 py-0.5 rounded text-amber-400 font-bold tracking-wider uppercase">v0.12-PRE_ALPHA</span>
            </div>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5 font-mono">environment: client_sandbox_vtx</p>
          </div>
        </div>

        {/* Compile Controls Button Suite */}
        <div className="flex items-center gap-2">
          {/* Loop Animation toggle */}
          <button 
            onClick={() => setAnimating(!animating)}
            className={`px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-2 transition-all ${
              animating 
                ? "bg-emerald-600/20 border border-emerald-500/60 text-emerald-400 shadow-sm" 
                : "bg-slate-900 border border-slate-700 hover:border-amber-300 text-slate-400 hover:text-white"
            }`}
            title="Starts RequestAnimationFrame loops drawing dynamic canvases."
            id="btn-loop-animation"
          >
            <Video className={`w-3.5 h-3.5 ${animating ? "animate-pulse" : ""}`} />
            <span>{animating ? "Looping Canvas" : "Loop Animation"}</span>
          </button>

          {/* Core Evaluate Trigger */}
          <button 
            onClick={() => executeProgram()}
            disabled={compilingServer}
            className="px-4 py-1.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-200 text-slate-950 disabled:opacity-75 rounded text-xs font-black flex items-center gap-2 transition-all shadow-md shadow-amber-400/20 hover:scale-[1.03]"
            id="btn-run-program"
          >
            {compilingServer ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin stroke-slate-950" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-slate-950 stroke-slate-950" />
            )}
            <span>{compilingServer ? "COMPILING..." : "RUN PROGRAM"}</span>
          </button>

          {/* Reset program */}
          <button
            onClick={() => {
              updateCodeWithHistory(DEMO_SCRIPTS.intro.code, true);
              setConsoleLogs([]);
              setEnvironmentVariables([]);
              setExecutionTime(null);
              setAnimating(false);
              addTerminalRow("sys", "Core environment resets correctly. Text editor restored.");
            }}
            className="p-1.5 bg-slate-900 border border-slate-700 hover:border-amber-400 rounded text-slate-400 hover:text-white transition-colors"
            title="Reset code editor"
            id="btn-compiler-reset"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>
    </>
  );
}