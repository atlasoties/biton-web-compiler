import { useRef, useEffect } from "react";
import React from "react";

interface CodeEditorProps {
  code: string;
  updateCodeWithHistory: (code: string, immediate: boolean) => void;
  preRef: React.RefObject<HTMLPreElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  renderHighlightedKeywords: (codeText: string) => React.ReactNode;
  handleUndo: () => void;
  handleRedo: () => void;
}

export default function CodeEditor({
  code,
  updateCodeWithHistory,
  preRef,
  textareaRef,
  renderHighlightedKeywords,
  handleUndo,
  handleRedo,
}: CodeEditorProps) {
  const handleScroll = () => {
    if (textareaRef.current && preRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  useEffect(() => {
    return () => {
      // Cleanup if needed
    };
  }, []);

  return (
    <>
      {/* Code Workspace IDE Box */}
      <div className="flex-1 flex overflow-hidden relative" id="code-highlighter-wrapper">
        
        {/* Real-time Dynamic Line Numbers count */}
        <div className="w-11 bg-slate-950 font-mono text-[11px] text-slate-500 text-right pr-2.5 pt-4 select-none border-r border-slate-700 leading-6 shrink-0">
          {code.split("\n").map((_, i) => (
            <div key={i} className="min-h-[20px]">{i + 1}</div>
          ))}
        </div>

        {/* Overlaing Synchronized text Editor Area */}
        <div className="flex-1 relative h-full bg-slate-900 overflow-hidden">
          
          {/* Highlight Overlay beneath */}
          <pre 
            ref={preRef}
            className="absolute inset-0 w-full h-full p-4 m-0 pointer-events-none overflow-hidden font-mono text-sm leading-6 whitespace-pre break-all select-none"
            style={{ fontFamily: "'JetBrains Mono', Consolas, monospace" }}
            id="syntax-highlights-pre"
          >
            {renderHighlightedKeywords(code)}
          </pre>

          {/* Textarea Input Overlay */}
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => updateCodeWithHistory(e.target.value, false)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && !e.altKey) {
                if (e.key.toLowerCase() === 'z') {
                  e.preventDefault();
                  if (e.shiftKey) {
                    handleRedo();
                  } else {
                    handleUndo();
                  }
                } else if (e.key.toLowerCase() === 'y') {
                  e.preventDefault();
                  handleRedo();
                }
              }
            }}
            onScroll={handleScroll}
            className="absolute inset-0 w-full h-full p-4 m-0 bg-transparent text-transparent caret-white resize-none border-0 outline-none focus:ring-0 font-mono text-sm leading-6 whitespace-pre break-all scrollbar-thin"
            style={{ 
              fontFamily: "'JetBrains Mono', Consolas, monospace",
              WebkitTextFillColor: "transparent"
            }}
            spellCheck={false}
            id="interactive-code-textarea"
            placeholder="// Type biton code syntax..."
          />
        </div>
      </div>
    </>
  );
}