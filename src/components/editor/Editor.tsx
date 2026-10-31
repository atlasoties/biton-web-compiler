import React from "react";

import EditorHeader from "./EditorHeader";
import CodeEditor from "./CodeEditor";
import Terminal, { type TerminalRow } from "./Terminal";
import type { CompileResponse } from "../../../shared/api.ts";

interface EditorProps {
  fileName: string;
  code: string;
  setCode: (v: string) => void;
  lastRun: CompileResponse | null;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  markedLines: Map<number, "error" | "warning">;
  jumpTo: { line: number; col: number; seq: number } | null;
  terminalRows: TerminalRow[];
  setTerminalRows: React.Dispatch<React.SetStateAction<TerminalRow[]>>;
  terminalInput: string;
  setTerminalInput: (v: string) => void;
  handleTerminalSubmit: (e: React.FormEvent) => void;
}

export default function Editor(props: EditorProps) {
  return (
    <>
      <EditorHeader
        fileName={props.fileName}
        lastRun={props.lastRun}
        canUndo={props.canUndo}
        canRedo={props.canRedo}
        undo={props.undo}
        redo={props.redo}
      />
      <CodeEditor
        code={props.code}
        setCode={props.setCode}
        undo={props.undo}
        redo={props.redo}
        markedLines={props.markedLines}
        jumpTo={props.jumpTo}
      />
      <Terminal
        rows={props.terminalRows}
        setRows={props.setTerminalRows}
        input={props.terminalInput}
        setInput={props.setTerminalInput}
        onSubmit={props.handleTerminalSubmit}
      />
    </>
  );
}
