import type { Diagnostic, EmitKind } from "../../shared/api.ts";

/** Name the editor buffer is compiled under on the server. */
export const SOURCE_FILE = "main.bit";

export type Busy = "run" | "format" | null;

export interface EmitState {
  kind: EmitKind;
  text: string | null;
  /** Source the text was produced from, to show when it is out of date. */
  source: string | null;
  failed: boolean;
  loading: boolean;
}

/** Diagnostics that point into the editor buffer (not into an imported module). */
export const inBuffer = (d: Diagnostic) => d.line > 0 && (d.file === null || d.file === SOURCE_FILE); // kept for compatibility
export const inCurrentBuffer = (d: Diagnostic, activeFile: string) => d.line > 0 && (d.file === null || d.file === activeFile);

export type TerminalRowType = "cmd" | "out" | "err" | "warn" | "sys";
export interface TerminalRow {
  type: TerminalRowType;
  text: string;
}

export type OutputTab = "console" | "input" | "problems" | "pipeline";
