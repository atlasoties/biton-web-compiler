import { Cpu } from "lucide-react";
import React from "react";

interface VisualizerProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  addTerminalRow: (type: "cmd" | "out" | "err" | "sys", text: string) => void;
}

export default function Visualizer({ canvasRef, addTerminalRow }: VisualizerProps) {
  const clearCanvas = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, 320, 320);
        ctx.fillStyle = "#0c122a";
        ctx.fillRect(0, 0, 320, 320);
      }
    }
    addTerminalRow("sys", "Graphics canvas buffer cleared.");
  };

  return (
    <>
      {/* Section 1: Live graphics screen canvas (HTML5 output) */}
      <section className="p-3 border-b border-slate-700 bg-slate-900 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">BITON GRAPHICS SCREEN</span>
          </div>
          <span className="text-[9px] text-amber-400 bg-amber-400/10 border border-amber-400/25 px-1.5 rounded uppercase font-mono tracking-wide font-black">
            RENDERER OK
          </span>
        </div>

        {/* Custom Interactive HTML5 target output canvas */}
        <div className="w-full flex items-center justify-center bg-slate-900 rounded border border-slate-700 p-1 shadow-inner relative group">
          <canvas 
            ref={canvasRef}
            width={320}
            height={320}
            className="w-full aspect-square bg-slate-900 rounded outline-none transition-shadow group-hover:shadow-lg"
            id="biton-graphics-canvas"
          />
          
          <div className="absolute top-2 right-2 bg-slate-950/95 text-[9px] px-1.5 py-0.5 rounded font-mono text-slate-500 select-none border border-slate-700/20">
            320px x 320px
          </div>
        </div>

        {/* Canvas Actions bar */}
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-slate-500 italic">Call <code className="text-emerald-400 font-mono">canvas.*</code> to draw live pixels</p>
          <button
            onClick={clearCanvas}
            className="text-[10px] bg-slate-900 border border-slate-700 hover:border-amber-400 hover:text-white text-slate-400 px-2.5 py-1 rounded transition-colors font-bold"
            id="btn-clear-canvas"
          >
            Clear Screen
          </button>
        </div>
      </section>
    </>
  );
}