import React from "react";

export default function Footer({ errors }: { errors: any[] }) {
  return (
    <>
      {/* 4. Bottom Status telemetry metadata bar */}
      <footer className="h-6 bg-slate-950 border-t border-slate-700 text-slate-400 flex items-center justify-between px-3 text-[10px] font-semibold shrink-0 font-mono select-none" id="footer-comp-status">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="font-mono">✔</span>
            <span>BITON ADAPTER ACTIVE</span>
          </div>
          <div className="text-slate-500 font-bold">ISO/UTF-8</div>
          <div className="text-slate-500 font-bold">TARGET: GC_WASM</div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-slate-500 font-bold">ERRORS: {errors.length}</div>
          <div className="text-slate-500 italic">Pre-Alpha SDK v1.0.4</div>
          <div className="bg-slate-900 border-l border-slate-700 text-amber-400 px-3 h-full flex items-center font-extrabold font-mono tracking-widest text-[9px]">
            STUDIO MODE
          </div>
        </div>
      </footer>
    </>
  );
}