import { DEFAULT_ENTRY, type EmitKind } from "../../shared/api.ts";

/** Name of the first file in a new project. */
export const SOURCE_FILE = DEFAULT_ENTRY;

export type Busy = "run" | "format" | null;

export interface EmitState {
  kind: EmitKind;
  text: string | null;
  /** Source the text was produced from, to show when it is out of date. */
  source: string | null;
  failed: boolean;
  loading: boolean;
}

export type TerminalRowType = "cmd" | "out" | "err" | "warn" | "sys";
export interface TerminalRow {
  type: TerminalRowType;
  text: string;
}

export type OutputTab = "console" | "input" | "problems" | "pipeline";
