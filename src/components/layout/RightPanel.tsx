import { Check, AlertTriangle, Sparkles, Info, RefreshCw } from "lucide-react";
import React from "react";

interface RightPanelProps {
  rightPanel: "diagnostics" | "ai-helper";
  setRightPanel: (panel: "diagnostics" | "ai-helper") => void;
  errors: any[];
  geminiLoading: boolean;
  geminiError: string;
  explanation: string;
  aiSuccessMessage: string;
  aiGeneratorPrompt: string;
  setAiGeneratorPrompt: React.Dispatch<React.SetStateAction<string>>;
  handleCreatePromptSubmit: (e: React.FormEvent) => void;
  explainCurrentCode: () => Promise<void>;
  askAiToFixCode: () => Promise<void>;
}

export default function RightPanel({
  rightPanel,
  setRightPanel,
  errors,
  geminiLoading,
  geminiError,
  explanation,
  aiSuccessMessage,
  aiGeneratorPrompt,
  setAiGeneratorPrompt,
  handleCreatePromptSubmit,
  explainCurrentCode,
  askAiToFixCode,
}: RightPanelProps) {
  return (
    <>
      {/* Tab Selection for right side pane */}
      <div className="flex border-b border-slate-700 bg-slate-900 shrink-0 p-1">
        <button
          onClick={() => setRightPanel("diagnostics")}
          className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider text-center transition-all ${
            rightPanel === "diagnostics" 
              ? "bg-slate-950 text-amber-400 border-b-2 border-amber-400" 
              : "text-slate-500 hover:text-slate-300"
          }`}
          id="right-panel-tab-diagnostics"
        >
          Diagnostics
        </button>
        <button
          onClick={() => setRightPanel("ai-helper")}
          className={`flex-1 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider text-center transition-all ${
            rightPanel === "ai-helper" 
              ? "bg-slate-950 text-amber-400 border-b-2 border-amber-400" 
              : "text-slate-500 hover:text-slate-300"
          }`}
          id="right-panel-tab-ai"
        >
          AI Assistant
        </button>
      </div>

      {/* Section 2: Split dynamic view (Diagnostics or AI assistance) */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between bg-slate-900" id="right-panel-scroll-container">
        {rightPanel === "diagnostics" ? (
          <DiagnosticsPanel 
            errors={errors} 
            askAiToFixCode={askAiToFixCode} 
          />
        ) : (
          <AIHelperPanel
            geminiLoading={geminiLoading}
            geminiError={geminiError}
            explanation={explanation}
            aiSuccessMessage={aiSuccessMessage}
            aiGeneratorPrompt={aiGeneratorPrompt}
            setAiGeneratorPrompt={setAiGeneratorPrompt}
            handleCreatePromptSubmit={handleCreatePromptSubmit}
            explainCurrentCode={explainCurrentCode}
            askAiToFixCode={askAiToFixCode}
          />
        )}
      </div>
    </>
  );
}

function DiagnosticsPanel({
  errors,
  askAiToFixCode,
}: {
  errors: any[];
  askAiToFixCode: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest font-mono">LEXICAL DIAGNOSTICS</div>
        {errors.length > 0 && (
          <span className="text-[10px] bg-red-950/40 text-red-400 border border-red-500/35 px-1.5 rounded font-mono">
            {errors.length} ERRORS
          </span>
        )}
      </div>

      {errors.length === 0 ? (
        <div className="bg-slate-950 border border-slate-700 p-3 rounded flex items-start gap-2.5 shadow-sm">
          <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs font-bold text-slate-300">AST Tree Evaluator: Green</div>
            <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">No static syntax blocks violated lexical compliance parameters.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {errors.map((err, idx) => (
            <div 
              key={idx} 
              className="bg-red-950/15 p-3 rounded border-l-3 border-red-500 border border-red-900/30 animate-fade-in"
              id={`diagnostic-error-${idx}`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  ERROR
                </span>
                <span className="text-[9px] text-slate-500 font-mono">line {err.line}, col {err.col}</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-normal font-mono">{err.message}</p>
              
              <button 
                onClick={askAiToFixCode}
                className="mt-2 text-[10px] bg-red-900/25 text-red-300 border border-red-500/20 px-2.5 py-0.5 rounded hover:bg-red-900/40 transition-all font-mono"
                id={`diagnostics-fix-${idx}`}
              >
                ⚡ Auto-fix via Gemini
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Additional Code Analysis Telemetry */}
      <div className="pt-3 border-t border-slate-700 space-y-2.5">
        <div className="text-[10px] font-bold text-slate-500 uppercase font-mono">COMPILE RESULT</div>
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
          <div className="bg-slate-950 border border-slate-700 p-2 rounded">
            <div className="text-slate-500 font-bold">STATUS</div>
            <div className="text-xs font-bold text-amber-400 mt-0.5">{errors.length > 0 ? "ERROR" : "OK"}</div>
          </div>
          <div className="bg-slate-950 border border-slate-700 p-2 rounded">
            <div className="text-slate-500 font-bold">ERRORS</div>
            <div className="text-xs font-bold text-orange-400 mt-0.5">{errors.length}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AIHelperPanel({
  geminiLoading,
  geminiError,
  explanation,
  aiSuccessMessage,
  aiGeneratorPrompt,
  setAiGeneratorPrompt,
  handleCreatePromptSubmit,
  explainCurrentCode,
  askAiToFixCode,
}: {
  geminiLoading: boolean;
  geminiError: string;
  explanation: string;
  aiSuccessMessage: string;
  aiGeneratorPrompt: string;
  setAiGeneratorPrompt: React.Dispatch<React.SetStateAction<string>>;
  handleCreatePromptSubmit: (e: React.FormEvent) => void;
  explainCurrentCode: () => Promise<void>;
  askAiToFixCode: () => Promise<void>;
}) {
  return (
    <div className="flex-1 flex flex-col justify-between space-y-4">
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">GEMINI EXPERT COPILOT</span>
          <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
        </div>

        {/* AI Quick buttons */}
        <div className="grid grid-cols-2 gap-2 shrink-0">
          <button
            onClick={explainCurrentCode}
            disabled={geminiLoading}
            className="py-1.5 px-2.5 bg-amber-400/10 hover:bg-amber-400/25 border border-amber-400/20 rounded font-bold text-amber-400 text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            id="btn-ai-explain"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Explain Code</span>
          </button>
          <button
            onClick={askAiToFixCode}
            disabled={geminiLoading}
            className="py-1.5 px-2.5 bg-red-950/15 hover:bg-red-950/30 border border-red-500/25 rounded font-bold text-red-300 text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
            id="btn-ai-fix"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Fix Error</span>
          </button>
        </div>

        {/* API wait loader UI */}
        {geminiLoading && (
          <div className="p-4 bg-amber-400/5 border border-amber-400/20 rounded flex items-center gap-3 animate-pulse">
            <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
            <span className="text-[11px] text-slate-400">Consulting pre-alpha language model instructions...</span>
          </div>
        )}

        {/* Error display */}
        {geminiError && (
          <div className="p-3 bg-red-950/20 border border-red-900/35 rounded text-[11px] text-red-400 font-mono">
            [AI ERROR] {geminiError}
          </div>
        )}

        {/* Explain / Generated output result format */}
        {explanation && (
          <div className="p-3 bg-slate-950 border border-slate-700 rounded text-[11px] text-slate-200 font-mono leading-relaxed space-y-2 max-h-[220px] overflow-y-auto scrollbar-thin">
            <div className="text-[10px] text-amber-400 uppercase font-bold tracking-wider mb-1">ANALYZED RESULT</div>
            <div className="whitespace-pre-wrap break-words">{explanation}</div>
          </div>
        )}

        {aiSuccessMessage && (
          <div className="p-3 bg-amber-400/5 border border-amber-400/25 rounded text-[11px] text-slate-200 font-mono leading-relaxed max-h-[160px] overflow-y-auto scrollbar-thin">
            <div className="text-emerald-400 font-bold mb-1 font-mono uppercase text-[9px] tracking-wide">GENERATED SCRIPT OUTLINE</div>
            <p>{aiSuccessMessage}</p>
          </div>
        )}
      </div>

      {/* Boilerplate generator code creator prompt */}
      <form onSubmit={handleCreatePromptSubmit} className="pt-3 border-t border-slate-700 space-y-2">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block font-mono">
          Describe a canvas drawing or calculation program:
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={aiGeneratorPrompt}
            onChange={(e) => setAiGeneratorPrompt(e.target.value)}
            placeholder="e.g. Draw dynamic grid waveform canvas art..."
            className="flex-1 bg-slate-950 border border-slate-700 focus:border-amber-400 rounded px-2.5 py-1.5 text-xs text-slate-100 outline-none placeholder-slate-500"
            disabled={geminiLoading}
            id="ai-prompt-creator-input"
          />
          <button
            type="submit"
            disabled={geminiLoading || !aiGeneratorPrompt.trim()}
            className="px-2.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-200 disabled:bg-slate-800 text-slate-950 font-black rounded text-xs transition-colors cursor-pointer"
            id="btn-ai-prompt-submit"
          >
            Create
          </button>
        </div>
      </form>
    </div>
  );
}