// The project as React state: files, open tabs, the active file, the entry
// point and recently used files. Every action is one functional update, so
// actions never act on a stale copy of the project.

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";

import type { EditorHandle } from "../editor/CodeEditor";
import {
  copyPath,
  createFile,
  createFolder,
  deletePath,
  filesUnder,
  isFile,
  kindOf,
  movePath,
  resolveEntry,
  sanitizeProject,
  uniquePath,
  type Files,
} from "./project";
import { SOURCE_FILE } from "./state";
import type { Saved } from "./storage";

export interface ProjectState {
  files: Files;
  tabs: string[];
  active: string | null;
  /** The chosen entry point; see `resolveEntry` for the one actually used. */
  entry: string | null;
  recent: string[];
}

const MAX_RECENT = 20;

/** Build the project from what was saved (or a share link), repairing anything invalid. */
export function projectFrom(saved: Pick<Saved, "files" | "code" | "activeFile" | "tabs" | "entry" | "recent">, fallbackCode: string): ProjectState {
  const raw = saved.files && Object.keys(saved.files).length > 0 ? saved.files : { [SOURCE_FILE]: saved.code ?? fallbackCode };
  const { files, renamed } = sanitizeProject(raw);
  const follow = (p: string | null | undefined) => (p ? renamed.get(p) ?? p : null);
  const exists = (p: string | null): p is string => !!p && isFile(files, p);
  let active = follow(saved.activeFile);
  let tabs = (saved.tabs ?? []).map(follow).filter(exists);
  if (!exists(active)) active = tabs[0] ?? resolveEntry(files, null) ?? Object.keys(files).find((k) => !k.endsWith("/")) ?? null;
  if (saved.activeFile === null && saved.tabs?.length === 0) active = null; // every tab was closed
  if (active && !tabs.includes(active)) tabs = [...tabs, active];
  const entry = follow(saved.entry ?? null);
  return {
    files,
    tabs: [...new Set(tabs)],
    active,
    entry: exists(entry) ? entry : null,
    recent: (saved.recent ?? []).map(follow).filter(exists).slice(0, MAX_RECENT),
  };
}

const remapList = (list: string[], moved: ReadonlyMap<string, string>) => list.map((p) => moved.get(p) ?? p);

export function useProject(initial: () => ProjectState, editor: RefObject<EditorHandle | null>) {
  const [project, setProject] = useState<ProjectState>(initial);
  const latest = useRef(project);
  latest.current = project;

  const open = useCallback((path: string) => {
    setProject((s) => {
      if (!isFile(s.files, path)) return s;
      const tabs = s.tabs.includes(path) ? s.tabs : (() => {
        // A new tab opens to the right of the current one.
        const at = s.active ? s.tabs.indexOf(s.active) + 1 : s.tabs.length;
        return [...s.tabs.slice(0, at), path, ...s.tabs.slice(at)];
      })();
      return { ...s, tabs, active: path, recent: [path, ...s.recent.filter((p) => p !== path)].slice(0, MAX_RECENT) };
    });
  }, []);

  const closeTabs = useCallback((paths: string[]) => {
    setProject((s) => {
      const closing = new Set(paths);
      const tabs = s.tabs.filter((t) => !closing.has(t));
      let active = s.active;
      if (active && closing.has(active)) {
        // Like an IDE: the tab to the right, else the one to the left.
        const i = s.tabs.indexOf(active);
        active = s.tabs.slice(i + 1).find((t) => !closing.has(t)) ?? s.tabs.slice(0, i).reverse().find((t) => !closing.has(t)) ?? null;
      }
      return { ...s, tabs, active };
    });
  }, []);

  const reorderTabs = useCallback((tabs: string[]) => setProject((s) => ({ ...s, tabs })), []);

  /** The editor's text for `path` changed. */
  const write = useCallback((path: string, text: string) => {
    setProject((s) => (isFile(s.files, path) && s.files[path] !== text ? { ...s, files: { ...s.files, [path]: text } } : s));
  }, []);

  const create = useCallback(
    (path: string, kind: "file" | "folder", content = "") => {
      setProject((s) => ({ ...s, files: kind === "file" ? createFile(s.files, path, content) : createFolder(s.files, path) }));
      if (kind === "file") open(path);
    },
    [open],
  );

  const move = useCallback(
    (from: string, to: string) => {
      const s = latest.current;
      const { files, moved } = movePath(s.files, from, to);
      editor.current?.rename(moved);
      setProject((cur) => {
        // Apply to the current state (the files may have changed since `latest` was read).
        const next = cur === s ? files : movePath(cur.files, from, to).files;
        const follow = (p: string | null) => (p ? moved.get(p) ?? p : p);
        return { ...cur, files: next, tabs: remapList(cur.tabs, moved), active: follow(cur.active), entry: follow(cur.entry), recent: remapList(cur.recent, moved) };
      });
      return moved;
    },
    [editor],
  );

  const duplicate = useCallback(
    (path: string) => {
      const s = latest.current;
      const to = uniquePath(s.files, path);
      setProject((cur) => ({ ...cur, files: copyPath(cur.files, path, to) }));
      if (kindOf(s.files, path) === "file") open(to);
      return to;
    },
    [open],
  );

  /** Delete a file or folder; returns the state before, for undo. */
  const remove = useCallback(
    (path: string) => {
      const before = latest.current;
      const gone = new Set(filesUnder(before.files, path));
      editor.current?.forget(gone);
      setProject((s) => {
        const files = deletePath(s.files, path);
        const tabs = s.tabs.filter((t) => !gone.has(t));
        let active = s.active;
        if (active && gone.has(active)) {
          const i = s.tabs.indexOf(active);
          active = s.tabs.slice(i + 1).find((t) => !gone.has(t)) ?? s.tabs.slice(0, i).reverse().find((t) => !gone.has(t)) ?? null;
        }
        return { ...s, files, tabs, active, entry: s.entry && gone.has(s.entry) ? null : s.entry, recent: s.recent.filter((p) => !gone.has(p)) };
      });
      return { before, count: gone.size };
    },
    [editor],
  );

  const setEntry = useCallback((path: string | null) => setProject((s) => ({ ...s, entry: path })), []);

  /** Replace everything (undo of a delete, opening a shared project, another tab's changes). */
  const replace = useCallback((next: ProjectState) => setProject(next), []);

  /** Add or overwrite many files at once (imports). */
  const writeMany = useCallback((entries: Array<{ path: string; content: string }>) => {
    setProject((s) => {
      let files = s.files;
      for (const e of entries) files = createFile(files, e.path, e.content);
      return { ...s, files };
    });
  }, []);

  const entry = useMemo(() => resolveEntry(project.files, project.entry), [project.files, project.entry]);

  return {
    project,
    latest,
    entry,
    actions: { open, closeTabs, reorderTabs, write, create, move, duplicate, remove, setEntry, replace, writeMany },
  };
}

export type ProjectActions = ReturnType<typeof useProject>["actions"];
