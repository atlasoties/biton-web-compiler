import EditorHeader from "./EditorHeader";
import CodeEditor from "./CodeEditor";
import Terminal from "./Terminal";
import { useRef } from "react";
import React from "react";

interface EditorProps {
  code: string;
  setCode: React.Dispatch<React.SetStateAction<string>>;
  errors: any[];
  consoleLogs: string[];
  setConsoleLogs: React.Dispatch<React.SetStateAction<string[]>>;
  environmentVariables: any[];
  setEnvironmentVariables: React.Dispatch<React.SetStateAction<any[]>>;
  executionTime: number | null;
  setExecutionTime: React.Dispatch<React.SetStateAction<number | null>>;
  animating: boolean;
  setAnimating: React.Dispatch<React.SetStateAction<boolean>>;
  autoCompile: boolean;
  setAutoCompile: React.Dispatch<React.SetStateAction<boolean>>;
  compilingServer: boolean;
  setCompilingServer: React.Dispatch<React.SetStateAction<boolean>>;
  undoStack: string[];
  setUndoStack: React.Dispatch<React.SetStateAction<string[]>>;
  redoStack: string[];
  setRedoStack: React.Dispatch<React.SetStateAction<string[]>>;
  saveTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
  terminalHistory: Array<{ type: "cmd" | "out" | "err" | "sys"; text: string }>;
  setTerminalHistory: React.Dispatch<React.SetStateAction<Array<{ type: "cmd" | "out" | "err" | "sys"; text: string }>>>;
  addTerminalRow: (type: "cmd" | "out" | "err" | "sys", text: string) => void;
  updateCodeWithHistory: (newVal: string, immediate: boolean) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  renderHighlightedKeywords: (codeText: string) => React.ReactNode;
  executeProgram: (syncState?: boolean) => Promise<void>;
}

export default function Editor({
  code,
  setCode,
  errors,
  consoleLogs,
  setConsoleLogs,
  environmentVariables,
  setEnvironmentVariables,
  executionTime,
  setExecutionTime,
  animating,
  setAnimating,
  autoCompile,
  setAutoCompile,
  compilingServer,
  setCompilingServer,
  undoStack,
  setUndoStack,
  redoStack,
  setRedoStack,
  saveTimerRef,
  terminalHistory,
  setTerminalHistory,
  addTerminalRow,
  updateCodeWithHistory,
  handleUndo,
  handleRedo,
  renderHighlightedKeywords,
  executeProgram,
}: EditorProps) {
  const preRef = useRef<HTMLPreElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <>
      <EditorHeader
        executionTime={executionTime}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        undoStackLength={undoStack.length}
        redoStackLength={redoStack.length}
      />
      
      <CodeEditor
        code={code}
        updateCodeWithHistory={updateCodeWithHistory}
        preRef={preRef}
        textareaRef={textareaRef}
        renderHighlightedKeywords={renderHighlightedKeywords}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
      />
      
      <Terminal
        terminalHistory={terminalHistory}
        setTerminalHistory={setTerminalHistory}
      />
    </>
  );
}