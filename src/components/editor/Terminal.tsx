import React, { useEffect, useRef } from "react";
import { TerminalIcon } from "lucide-react";

export type TerminalRowType = "cmd" | "out" | "err" | "warn" | "sys";
export interface TerminalRow {
  type: TerminalRowType;
  text: string;
}

interface TerminalProps {
  rows: TerminalRow[];
  setRows: React.Dispatch<React.SetStateAction<TerminalRow[]>>;
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const STYLES: Record<TerminalRowType, string> = {
  cmd: "text-[#fcd389]/60",
  out: "text-zinc-100",
  err: "bg-red-950/25 text-red-300 px-2.5 py-1.5 rounded border border-red-500/30",
  warn: "bg-amber-950/20 text-amber-200 px-2.5 py-1.5 rounded border border-amber-500/25",
  sys: "text-[#ffa500]/85 italic",
};

export default function Terminal({ rows, setRows, input, setInput, onSubmit }: TerminalProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [rows]);

  return (
    <section className="h-60 bg-[#0c122a] border-t border-[#6d5f50]/40 flex flex-col font-mono shrink-0">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#051139] border-b border-[#6d5f50]/35 select-none">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-3.5 h-3.5 text-[#fec153]" />
          <span className="text-[10px] font-bold text-[#fcd389]/70 uppercase tracking-widest">Output</span>
        </div>
        <button onClick={() => setRows([])} className="text-[10px] text-[#fcd389]/55 hover:text-white hover:underline uppercase font-bold">
          Clear
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto text-[11px] leading-relaxed space-y-1.5 scrollbar-thin">
        {rows.map((row, idx) =>
          row.type === "cmd" ? (
            <div key={idx} className={`flex items-start gap-1 ${STYLES.cmd}`}>
              <span className="text-[#6d5f50] select-none font-bold">$</span>
              <span className="whitespace-pre-wrap">{row.text}</span>
            </div>
          ) : (
            <div key={idx} className={`whitespace-pre-wrap ${STYLES[row.type]}`}>
              {row.text}
            </div>
          ),
        )}
      </div>

      <form onSubmit={onSubmit} className="border-t border-[#6d5f50]/30 flex items-center bg-[#051139] px-3 shrink-0">
        <span className="text-[#fec153] font-bold mr-2 select-none">$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="run · check · emit ir · opt O0 · help"
          className="flex-1 bg-transparent py-2 outline-none text-[#fcd389] placeholder-[#fcd389]/30 text-[11px] border-0"
          aria-label="Terminal command"
          spellCheck={false}
        />
      </form>
    </section>
  );
}
