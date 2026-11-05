// The workspace (buffer, stdin, arguments, -O level, layout, font size) survives a
// reload in localStorage. Storage can be missing or throw (private mode,
// blocked site data, quota), so every access is guarded.

const KEY = "biton-web-compiler:v4";
const OLD_KEY = "biton-web-compiler:v3";

export interface FileEntry {
  name: string;
  content: string;
  isFolder?: boolean;
}

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
  /** Multi-file project support */
  files?: Record<string, string>;
  activeFile?: string;
}

export function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(OLD_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as Saved) : {};
  } catch {
    return {};
  }
}

export function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* full or unavailable: the workspace just won't persist */
  }
}
