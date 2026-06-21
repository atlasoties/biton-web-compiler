import { TerminalIcon } from "lucide-react";
import React from "react";

interface TerminalProps {
  terminalHistory: Array<{ type: "cmd" | "out" | "err" | "sys"; text: string }>;
  setTerminalHistory: React.Dispatch<React.SetStateAction<Array<{ type: "cmd" | "out" | "err" | "sys"; text: string }>>>;
}

export default function Terminal({
  terminalHistory,
  setTerminalHistory,
}: TerminalProps) {
  const clearTerminal = () => {
    setTerminalHistory([{ type: "sys", text: "Interactive terminal console flushed." }]);
  };

  return (
    <>
      {/* 3. TERMINAL EMULATOR: Full command simulator directly inside branded widget */}
      <section className="h-56 bg-[#0c122a] border-t border-[#6d5f50]/40 flex flex-col font-mono shrink-0" id="terminal-emulator">
        
        {/* Terminal Top bar controls */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-[#051139] border-b border-[#6d5f50]/35 select-none">
          <div className="flex items-center gap-2">
            <TerminalIcon className="w-3.5 h-3.5 text-[#fec153]" />
            <span className="text-[10px] font-bold text-[#fcd389]/70 uppercase tracking-widest font-mono">Terminal Console — biton-shell</span>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={clearTerminal}
              className="text-[10px] text-[#fcd389]/55 hover:text-white hover:underline uppercase transition-all font-bold"
              id="btn-clear-terminal-logs"
            >
              Clear Console
            </button>
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#0c122a] border border-[#6d5f50]/40"></div>
              <div className="w-2.5 h-2.5 rounded-full bg-[#ffa500]/40"></div>
            </div>
          </div>
        </div>

        {/* Scrollable Shell Output Rows */}
        <div className="flex-1 p-3 overflow-y-auto text-[11px] leading-relaxed space-y-1.5 scrollbar-thin font-mono text-zinc-400">
          {terminalHistory.map((row, idx) => {
            if (row.type === "cmd") {
              return (
                <div key={idx} className="flex items-start gap-1 font-mono text-zinc-400">
                  <span className="text-zinc-500 select-none font-bold">$</span>
                  <span className="whitespace-pre-wrap">{row.text}</span>
                </div>
              );
            }
            if (row.type === "err") {
              return (
                <div key={idx} className="bg-red-950/25 text-red-300 px-2.5 py-1.5 rounded border border-red-500/30 font-mono whitespace-pre-wrap">
                  <span className="text-zinc-500 select-none font-bold">!</span>
                  <span className="whitespace-pre-wrap">{row.text}</span>
                </div>
              );
            }
            if (row.type === "out") {
              return (
                <div key={idx} className="whitespace-pre-wrap font-mono text-emerald-400">
                  <span className="text-zinc-500 select-none font-bold">&gt;</span>
                  <span className="whitespace-pre-wrap">{row.text}</span>
                </div>
              );
            }
            // sys type
            return (
              <div key={idx} className="whitespace-pre-wrap font-mono text-amber-400">
                <span className="text-amber-500 select-none font-bold">*</span>
                <span className="whitespace-pre-wrap">{row.text}</span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}