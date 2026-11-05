// The project: a flat map of path → text, kept in the browser.
//
// Files are keyed by their slash-separated path ("src/util/geo.bit"); folders
// are keyed with a trailing slash ("src/util/") so that an empty folder can
// exist. Every operation here is pure and keeps one invariant: each ancestor
// folder of every entry has its own key. The UI and storage only ever see
// projects that went through these functions.

import { DEFAULT_ENTRY, MAX_PATH_LENGTH, projectPathProblem } from "../../shared/api.ts";

export type Files = Record<string, string>;

export interface TreeNode {
  name: string;
  /** File path, or folder path without the trailing slash. */
  path: string;
  kind: "file" | "folder";
  children: TreeNode[];
}

export const isFolderKey = (key: string) => key.endsWith("/");
const folderKey = (path: string) => `${path}/`;
const has = (files: Files, key: string) => Object.prototype.hasOwnProperty.call(files, key);

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** ".bit" for "src/a.bit"; "" when there is none (or the name is all extension). */
export function extname(path: string): string {
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot) : "";
}

export const joinPath = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** Ancestor folders of a path, outermost first: "a/b/c.bit" → ["a", "a/b"]. */
export function ancestors(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

/** What the user typed, tidied: forward slashes, no leading "./" or "/", no doubled or trailing slashes. */
export function normalizeInput(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

/** Biton sources get ".bit" unless the name already has an extension. */
export const withDefaultExtension = (path: string) => (extname(path) ? path : `${path}.bit`);

export function kindOf(files: Files, path: string): "file" | "folder" | null {
  if (!path) return "folder"; // the root
  if (has(files, path)) return "file";
  if (has(files, folderKey(path))) return "folder";
  return null;
}

export const isFile = (files: Files, path: string) => kindOf(files, path) === "file";

/** File paths, without folders, in tree order. */
export function listFiles(files: Files): string[] {
  return Object.keys(files)
    .filter((k) => !isFolderKey(k))
    .sort(comparePaths);
}

/** Every path under a folder (files and folder keys), the folder's own key included. */
function keysUnder(files: Files, folder: string): string[] {
  const prefix = folderKey(folder);
  return Object.keys(files).filter((k) => k.startsWith(prefix));
}

/** Natural, case-insensitive order ("file2" before "file10"). */
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
export const compareNames = (a: string, b: string) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
function comparePaths(a: string, b: string): number {
  const pa = a.split("/");
  const pb = b.split("/");
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue;
    // A folder sorts before a file at the same level.
    const aFolder = i < pa.length - 1;
    const bFolder = i < pb.length - 1;
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return compareNames(pa[i], pb[i]);
  }
  return pa.length - pb.length;
}

/** Add the missing ancestor-folder keys. */
function withAncestors(files: Files): Files {
  const out = { ...files };
  for (const key of Object.keys(files)) {
    for (const dir of ancestors(isFolderKey(key) ? key.slice(0, -1) : key)) {
      if (!has(out, folderKey(dir))) out[folderKey(dir)] = "";
    }
  }
  return out;
}

/**
 * Why `path` cannot be created as a `kind` (null if it can). `ignore` is a
 * path being renamed, which does not conflict with itself.
 */
export function pathProblem(files: Files, path: string, kind: "file" | "folder", ignore?: string): string | null {
  const shape = projectPathProblem(path);
  if (shape) return shape;
  if (path === ignore) return null;
  const existing = kindOf(files, path);
  if (existing) return `A ${existing} named “${basename(path)}” already exists${dirname(path) ? ` in ${dirname(path)}` : ""}.`;
  for (const dir of ancestors(path)) {
    if (isFile(files, dir) && dir !== ignore) return `“${dir}” is a file, not a folder.`;
  }
  if (ignore && kindOf(files, ignore) === "folder" && kind === "folder" && (path + "/").startsWith(ignore + "/")) {
    return "A folder cannot be moved inside itself.";
  }
  return null;
}

export function createFile(files: Files, path: string, content = ""): Files {
  return withAncestors({ ...files, [path]: content });
}

export function createFolder(files: Files, path: string): Files {
  return withAncestors({ ...files, [folderKey(path)]: "" });
}

/** Remove a file, or a folder with everything in it. */
export function deletePath(files: Files, path: string): Files {
  const out = { ...files };
  if (kindOf(files, path) === "folder") for (const k of keysUnder(files, path)) delete out[k];
  else delete out[path];
  return out;
}

/** Paths of the files a delete would remove. */
export function filesUnder(files: Files, path: string): string[] {
  return kindOf(files, path) === "folder" ? keysUnder(files, path).filter((k) => !isFolderKey(k)) : isFile(files, path) ? [path] : [];
}

/**
 * Rename or move a file or folder. Returns the new project and how each file
 * path changed (for open tabs, the entry and editor state). Check the target
 * with `pathProblem` first.
 */
export function movePath(files: Files, from: string, to: string): { files: Files; moved: Map<string, string> } {
  const moved = new Map<string, string>();
  if (from === to) return { files, moved };
  const out = { ...files };
  if (kindOf(files, from) === "folder") {
    for (const key of keysUnder(files, from)) {
      const next = folderKey(to) + key.slice(folderKey(from).length);
      delete out[key];
      out[next] = files[key];
      if (!isFolderKey(key)) moved.set(key, next);
    }
  } else if (isFile(files, from)) {
    delete out[from];
    out[to] = files[from];
    moved.set(from, to);
  }
  return { files: withAncestors(out), moved };
}

/** Copy a file or folder to `to` (which must be free). */
export function copyPath(files: Files, from: string, to: string): Files {
  const out = { ...files };
  if (kindOf(files, from) === "folder") {
    for (const key of keysUnder(files, from)) out[folderKey(to) + key.slice(folderKey(from).length)] = files[key];
  } else if (isFile(files, from)) {
    out[to] = files[from];
  }
  return withAncestors(out);
}

/** `desired`, or the first free "name-copy", "name-copy-2", … beside it. */
export function uniquePath(files: Files, desired: string, suffix = "copy"): string {
  if (!kindOf(files, desired) && !projectPathProblem(desired)) return desired;
  const dir = dirname(desired);
  const ext = extname(desired);
  const stem = basename(desired).slice(0, basename(desired).length - ext.length);
  for (let n = 1; ; n++) {
    const candidate = joinPath(dir, `${stem}-${suffix}${n > 1 ? `-${n}` : ""}${ext}`);
    if (!kindOf(files, candidate)) return candidate;
  }
}

/** A free path for a new file named `name` inside `dir` ("untitled.bit", "untitled-2.bit", …). */
export function freshPath(files: Files, dir: string, name: string): string {
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 1; ; n++) {
    const candidate = joinPath(dir, `${stem}${n > 1 ? `-${n}` : ""}${ext}`);
    if (!kindOf(files, candidate)) return candidate;
  }
}

export function buildTree(files: Files): TreeNode[] {
  const root: TreeNode = { name: "", path: "", kind: "folder", children: [] };
  const folders = new Map<string, TreeNode>([["", root]]);
  const folder = (path: string): TreeNode => {
    let node = folders.get(path);
    if (!node) {
      node = { name: basename(path), path, kind: "folder", children: [] };
      folders.set(path, node);
      folder(dirname(path)).children.push(node);
    }
    return node;
  };
  for (const key of Object.keys(files)) {
    if (isFolderKey(key)) folder(key.slice(0, -1));
    else folder(dirname(key)).children.push({ name: basename(key), path: key, kind: "file", children: [] });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => (a.kind !== b.kind ? (a.kind === "folder" ? -1 : 1) : compareNames(a.name, b.name)));
    for (const n of nodes) sort(n.children);
  };
  sort(root.children);
  return root.children;
}

/** The visible rows of a tree whose folders open according to `expanded`. */
export function visibleRows(tree: TreeNode[], expanded: ReadonlySet<string>, depth = 0): Array<{ node: TreeNode; depth: number }> {
  const rows: Array<{ node: TreeNode; depth: number }> = [];
  for (const node of tree) {
    rows.push({ node, depth });
    if (node.kind === "folder" && expanded.has(node.path)) rows.push(...visibleRows(node.children, expanded, depth + 1));
  }
  return rows;
}

/**
 * Project files a Biton source imports, resolved as the compiler does: from
 * the importing file's folder, `import a.b` is "a/b.bit" (or the module "a.bit"
 * when `b` is an item). The standard library (`std.*`) is not in the project.
 */
export function importsOf(files: Files, path: string, source: string): string[] {
  const dir = dirname(path);
  const found = new Set<string>();
  const re = /^\s*import\s+([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)/gm;
  for (let m; (m = re.exec(source)); ) {
    const parts = m[1].split(".");
    if (parts[0] === "std") continue;
    for (let n = parts.length; n > 0; n--) {
      const candidate = joinPath(dir, `${parts.slice(0, n).join("/")}.bit`);
      if (isFile(files, candidate) && candidate !== path) {
        found.add(candidate);
        break;
      }
    }
  }
  return [...found];
}

/** The file to run: the chosen entry if it still exists, else main.bit, else the first .bit file at the top level. */
export function resolveEntry(files: Files, entry: string | null | undefined): string | null {
  if (entry && isFile(files, entry)) return entry;
  if (isFile(files, DEFAULT_ENTRY)) return DEFAULT_ENTRY;
  return listFiles(files).find((p) => !p.includes("/") && p.endsWith(".bit")) ?? null;
}

/** Make a saved or imported name acceptable to `projectPathProblem`. */
export function sanitizePath(raw: string): string {
  const parts = normalizeInput(raw)
    .split("/")
    .filter((p) => p && p !== "." && p !== "..")
    .map((p) => p.replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^[.]+/, "_"));
  let path = parts.join("/").slice(0, MAX_PATH_LENGTH);
  if (!path || projectPathProblem(path)) path = path.replace(/[^A-Za-z0-9_./-]/g, "_") || "untitled.bit";
  return projectPathProblem(path) ? `file_${Math.random().toString(36).slice(2, 8)}.bit` : path;
}

/**
 * A project read from storage, a share link or an import, made valid: names
 * sanitized (renamed on conflict), non-text values dropped, folders added.
 * Returns the renames so references (tabs, entry) can follow them.
 */
export function sanitizeProject(input: unknown): { files: Files; renamed: Map<string, string> } {
  const out: Files = {};
  const renamed = new Map<string, string>();
  if (!input || typeof input !== "object") return { files: out, renamed };
  // Folders first, so a file named like a folder is the one that moves.
  const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) => Number(isFolderKey(b)) - Number(isFolderKey(a)));
  for (const [key, value] of entries) {
    if (typeof value !== "string") continue;
    if (isFolderKey(key)) {
      const path = sanitizePath(key);
      if (!isFile(out, path)) out[folderKey(path)] = "";
      continue;
    }
    let path = sanitizePath(key);
    if (pathProblem(withAncestors(out), path, "file")) path = uniquePath(out, path, "renamed");
    // Still blocked (an ancestor is a file): keep it at the top level instead.
    if (pathProblem(withAncestors(out), path, "file")) path = uniquePath(out, basename(path), "renamed");
    if (path !== key) renamed.set(key, path);
    out[path] = value;
  }
  return { files: withAncestors(out), renamed };
}
