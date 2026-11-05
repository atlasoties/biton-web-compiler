// The workspace (buffer, stdin, arguments, -O level, layout, font size) survives a
// reload in localStorage. Storage can be missing or throw (private mode,
// blocked site data, quota), so every access is guarded.

const KEY = "biton-web-compiler:v4";
const OLD_KEY = "biton-web-compiler:v3";

export interface Saved {
  code?: string;
  stdin?: string;
  args?: string;
  opt?: string;
  /** Open side panel ("files", "language", "stdlib"), or null when closed. */
  sidePanel?: string | null;
  showPanel?: boolean;
  outputTab?: string;
  /** Share of the width (or height, stacked) the output pane takes. */
  split?: number;
  fontSize?: number;
  /** Whether AI completion is enabled in the editor. */
  ai?: boolean;
  /** The project: path → text; keys ending in "/" are folders (see lib/project.ts). */
  files?: Record<string, string>;
  /** File shown in the editor, or null when every tab is closed. */
  activeFile?: string | null;
  /** Open editor tabs, in order. */
  tabs?: string[];
  /** File Run compiles and runs. */
  entry?: string | null;
  /** Recently opened files, most recent first (for quick open). */
  recent?: string[];
}

/** True when a `storage` event means another tab saved its workspace. */
export const savedElsewhere = (e: StorageEvent) => e.key === KEY && e.newValue !== null;

export function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as Saved) : {};
  } catch {
    return {};
  }
}

/** Save the workspace; false when storage is full or unavailable. */
export function save(s: Saved): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
