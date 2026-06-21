import { Undo2, Redo2 } from "lucide-react";
import React from "react";

interface EditorHeaderProps {
  executionTime: number | null;
  handleUndo: () => void;
  handleRedo: () => void;
  undoStackLength: number;
  redoStackLength: number;
}

export default function EditorHeader({
  executionTime,
  handleUndo,
  handleRedo,
  undoStackLength,
  redoStackLength,
}: EditorHeaderProps) {
  return (
    <>
      {/* Editor Header stats */}
      <section className="bg-slate-950 px-4 py-2 border-b border-slate-700 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-emerald-500 font-bold font-mono">●</span>
          <span className="text-white font-mono font-bold">scratchpad.bt</span>
          <span className="text-slate-600 font-bold">|</span>
          <span className="text-[10px] bg-slate-900 border border-slate-700 px-1.5 py-0.5 rounded text-amber-400 uppercase font-mono font-bold">biton language syntax</span>
        </div>
        
        <div className="flex items-center gap-4">
          {executionTime !== null && (
            <div className="font-mono text-[10px] text-emerald-400 animate-pulse">
              last evaluation: <span className="font-bold">{executionTime}ms</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            {/* Undo/Redo History controls */}
            <div className="flex items-center gap-1 border-r border-slate-700 pr-3 mr-1">
              <button
                onClick={handleUndo}
                disabled={undoStackLength === 0}
                className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-slate-900 border border-transparent hover:border-slate-600"
                title="Undo (Ctrl+Z)"
                id="btn-editor-undo"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleRedo}
                disabled={redoStackLength === 0}
                className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all hover:bg-slate-900 border border-transparent hover:border-slate-600"
                title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
                id="btn-editor-redo"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              {/* Subtle state indicator */}
              {(undoStackLength > 0 || redoStackLength > 0) && (
                <span className="text-[9px] font-mono text-amber-400 px-1.5 py-0.2 rounded bg-amber-400/10 ml-1 select-none border border-amber-400/20 font-bold">
                  {undoStackLength}h
                </span>
              )}
            </div>

            {/* Format Code Action - hidden since lexer removed */}
            <div className="text-[10px] text-slate-400 font-medium">Server-side compile</div>
          </div>
        </div>
      </section>
    </>
  );
}