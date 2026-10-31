import { Redo2, Undo2 } from "lucide-react";

import type { CompileResponse } from "../../../shared/api.ts";

interface EditorHeaderProps {
  fileName: string;
  lastRun: CompileResponse | null;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

export default function EditorHeader({ fileName, lastRun, canUndo, canRedo, undo, redo }: EditorHeaderProps) {
  return (
    <section className="bg-[#051139] px-4 py-2 border-b border-[#6d5f50]/40 flex items-center justify-between text-xs text-[#fcd389]/60 shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-emerald-500 font-bold font-mono">●</span>
        <span className="text-white font-mono font-bold">{fileName}</span>
      </div>

      <div className="flex items-center gap-4">
        {lastRun && (
          <div className="font-mono text-[10px] text-[#fcd389]/60">
            compile <span className="text-emerald-400 font-bold">{Math.round(lastRun.compileTimeMs)} ms</span>
            {lastRun.run && (
              <>
                {" · "}run <span className="text-emerald-400 font-bold">{Math.round(lastRun.run.runTimeMs)} ms</span>
              </>
            )}
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="p-1 rounded text-[#fcd389]/75 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#0c122a]"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-1 rounded text-[#fcd389]/75 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#0c122a]"
            title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
