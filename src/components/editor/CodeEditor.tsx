import { useEffect, useMemo, useRef } from "react";

import { highlight } from "../../lib/highlight";

interface CodeEditorProps {
  code: string;
  setCode: (v: string) => void;
  undo: () => void;
  redo: () => void;
  markedLines: Map<number, "error" | "warning">;
  jumpTo: { line: number; col: number; seq: number } | null;
}

const INDENT = "    ";
const LINE_HEIGHT = 24; // keep in sync with leading-6 below

/** A textarea over a highlighted <pre>; both scroll together and never wrap. */
export default function CodeEditor({ code, setCode, undo, redo, markedLines, jumpTo }: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  const highlighted = useMemo(() => highlight(code, markedLines), [code, markedLines]);
  const lineCount = useMemo(() => code.split("\n").length, [code]);

  const syncScroll = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (preRef.current) {
      preRef.current.scrollTop = ta.scrollTop;
      preRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  };

  // Move the caret to a diagnostic's location.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!jumpTo || !ta) return;
    const lines = code.split("\n");
    let offset = 0;
    for (let i = 0; i < jumpTo.line - 1 && i < lines.length; i++) offset += lines[i].length + 1;
    offset += Math.max(0, jumpTo.col - 1);
    ta.focus();
    ta.setSelectionRange(offset, offset);
    ta.scrollTop = Math.max(0, (jumpTo.line - 5) * LINE_HEIGHT);
    syncScroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.seq]);

  /** Replace the selection and keep the caret where the browser would put it. */
  const replaceSelection = (ta: HTMLTextAreaElement, start: number, end: number, text: string, caret: number) => {
    setCode(code.slice(0, start) + text + code.slice(end));
    requestAnimationFrame(() => ta.setSelectionRange(caret, caret));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const mod = (e.ctrlKey || e.metaKey) && !e.altKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (e.key === "Tab" && !mod) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: t } = ta;
      if (e.shiftKey) {
        // Outdent the current line.
        const lineStart = code.lastIndexOf("\n", s - 1) + 1;
        const lead = /^ {1,4}/.exec(code.slice(lineStart))?.[0].length ?? 0;
        if (lead) replaceSelection(ta, lineStart, lineStart + lead, "", Math.max(lineStart, s - lead));
      } else {
        replaceSelection(ta, s, t, INDENT, s + INDENT.length);
      }
      return;
    }
    if (e.key === "Enter" && !mod && !e.shiftKey) {
      // Keep the current indentation, and indent one more level after `{`.
      e.preventDefault();
      const { selectionStart: s, selectionEnd: t } = ta;
      const lineStart = code.lastIndexOf("\n", s - 1) + 1;
      const indent = /^[ \t]*/.exec(code.slice(lineStart, s))![0];
      const extra = code.slice(lineStart, s).trimEnd().endsWith("{") ? INDENT : "";
      const text = "\n" + indent + extra;
      replaceSelection(ta, s, t, text, s + text.length);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden relative min-h-0">
      <div
        ref={gutterRef}
        className="w-12 bg-[#051139] font-mono text-[11px] text-right pr-2.5 py-4 select-none border-r border-[#6d5f50]/35 leading-6 shrink-0 overflow-hidden"
        aria-hidden="true"
      >
        {Array.from({ length: lineCount }, (_, i) => {
          const mark = markedLines.get(i + 1);
          const tone = mark === "error" ? "text-red-400 font-bold" : mark === "warning" ? "text-amber-300 font-bold" : "text-[#fcd389]/40";
          return (
            <div key={i} className={`h-6 ${tone}`}>
              {i + 1}
            </div>
          );
        })}
      </div>

      <div className="flex-1 relative h-full bg-[#0c122a] overflow-hidden">
        <pre
          ref={preRef}
          className="absolute inset-0 py-4 px-4 m-0 pointer-events-none overflow-hidden font-mono text-sm leading-6 whitespace-pre select-none"
          style={{ fontFamily: "'JetBrains Mono', Consolas, monospace" }}
          aria-hidden="true"
        >
          {highlighted}
          {/* room for the textarea's horizontal scrollbar */}
          <div className="h-4" />
        </pre>

        <textarea
          ref={textareaRef}
          value={code}
          wrap="off"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={syncScroll}
          className="absolute inset-0 w-full h-full py-4 px-4 m-0 bg-transparent text-transparent caret-white resize-none border-0 outline-none font-mono text-sm leading-6 whitespace-pre overflow-auto scrollbar-thin"
          style={{ fontFamily: "'JetBrains Mono', Consolas, monospace", WebkitTextFillColor: "transparent", tabSize: 4 }}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          aria-label="Biton source code"
          placeholder="// write Biton code here"
        />
      </div>
    </div>
  );
}
