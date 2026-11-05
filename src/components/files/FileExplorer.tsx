// The project's file tree, as in an IDE: collapsible folders, inline create
// and rename, a context menu, keyboard navigation, drag-and-drop to move
// files, and dropping or uploading files, folders and .zip archives.

import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  ChevronRight,
  ChevronsDownUp,
  ClipboardCopy,
  Copy,
  Download,
  FilePlus2,
  FolderPlus,
  FolderUp,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
  Upload,
} from "lucide-react";

import { fromDrop, fromInput, type Picked } from "../../lib/importFiles";
import {
  ancestors,
  basename,
  buildTree,
  dirname,
  extname,
  joinPath,
  kindOf,
  normalizeInput,
  pathProblem,
  visibleRows,
  withDefaultExtension,
  type Files,
  type TreeNode,
} from "../../lib/project";
import { useContextMenu, type MenuItem } from "../ContextMenu";
import { IconButton, cx } from "../ui";
import { FileIcon } from "./FileIcon";

const DRAG_TYPE = "application/x-biton-path";
const EXPANDED_KEY = "biton-web-compiler:expanded";
const INDENT = 12;
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";

export interface FileProblems {
  errors: number;
  warnings: number;
}

interface FileExplorerProps {
  files: Files;
  activeFile: string | null;
  entry: string | null;
  problems: ReadonlyMap<string, FileProblems>;
  /** Changes when the active file should be scrolled into view and its folders opened. */
  revealToken: number;
  onOpen: (path: string) => void;
  onCreate: (path: string, kind: "file" | "folder") => void;
  /** Move or rename; the target has been checked with `pathProblem`. */
  onMove: (from: string, to: string) => void;
  onDuplicate: (path: string) => void;
  onDelete: (path: string) => void;
  onSetEntry: (path: string) => void;
  /** A file downloads as itself; a folder (or "" for the whole project) as a .zip. */
  onDownload: (path: string) => void;
  onCopyPath: (path: string) => void;
  onImport: (picked: Picked[], intoFolder: string) => void;
  onError: (message: string) => void;
}

type Editing = { mode: "rename"; path: string } | { mode: "new"; kind: "file" | "folder"; parent: string };

function loadExpanded(): Set<string> {
  try {
    const v = JSON.parse(localStorage.getItem(EXPANDED_KEY) ?? "null");
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

/** Folder containing everything under it with problems, for the folder's marker. */
function folderProblems(problems: ReadonlyMap<string, FileProblems>, folder: string): FileProblems {
  let errors = 0;
  let warnings = 0;
  for (const [path, p] of problems) {
    if (path.startsWith(folder + "/")) {
      errors += p.errors;
      warnings += p.warnings;
    }
  }
  return { errors, warnings };
}

/** The input used for creating and renaming in place. */
function InlineInput({
  initial,
  depth,
  icon,
  validate,
  onCommit,
  onCancel,
}: {
  initial: string;
  depth: number;
  icon: ReactNode;
  validate: (value: string) => string | null;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);
  const done = useRef(false);
  const problem = value.trim() ? validate(value) : null;

  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    input.focus();
    // Select the name without its extension, like a rename usually does.
    const dot = initial.lastIndexOf(".");
    input.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);

  const commit = () => {
    if (done.current) return;
    if (!value.trim() || value.trim() === initial) {
      done.current = true;
      onCancel();
      return;
    }
    if (problem) {
      setTouched(true);
      return;
    }
    done.current = true;
    onCommit(value);
  };

  return (
    <div className="relative" style={{ paddingLeft: 8 + depth * INDENT + 16 }}>
      <div className="flex items-center gap-1.5 h-[26px] pr-2">
        {icon}
        <input
          ref={ref}
          value={value}
          spellCheck={false}
          autoComplete="off"
          aria-label="Name"
          aria-invalid={problem ? true : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            setTouched(true);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              done.current = true;
              onCancel();
            }
          }}
          onBlur={() => {
            // Leaving the field keeps a valid name and drops an invalid one.
            if (problem) {
              done.current = true;
              onCancel();
            } else commit();
          }}
          className={cx(
            "flex-1 min-w-0 h-[22px] px-1.5 rounded-[4px] bg-surface border font-mono text-[12px] text-fg outline-none",
            problem && touched ? "border-danger" : "border-accent",
          )}
        />
      </div>
      {problem && touched && (
        <div role="alert" className="absolute z-10 left-0 right-2 mx-2 px-2 py-1 rounded-md bg-danger text-white dark:text-[#1f0606] text-[11.5px] leading-snug shadow-pop" style={{ marginLeft: 8 + depth * INDENT + 16 }}>
          {problem}
        </div>
      )}
    </div>
  );
}

export default function FileExplorer(p: FileExplorerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(loadExpanded);
  const [focused, setFocused] = useState<string | null>(p.activeFile);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const tree = useMemo(() => buildTree(p.files), [p.files]);
  const rows = useMemo(() => visibleRows(tree, expanded), [tree, expanded]);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const uploadTarget = useRef("");
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menu = useContextMenu();
  const fileCount = useMemo(() => Object.keys(p.files).filter((k) => !k.endsWith("/")).length, [p.files]);

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
    } catch {
      /* not essential */
    }
  }, [expanded]);

  // Open the folders around the active file and bring it into view.
  useEffect(() => {
    if (!p.activeFile) return;
    const dirs = ancestors(p.activeFile);
    setExpanded((s) => (dirs.every((d) => s.has(d)) ? s : new Set([...s, ...dirs])));
    setFocused(p.activeFile);
    requestAnimationFrame(() => document.getElementById(rowId(p.activeFile!))?.scrollIntoView({ block: "nearest" }));
  }, [p.activeFile, p.revealToken]);

  // Forget expanded folders that no longer exist.
  useEffect(() => {
    setExpanded((s) => {
      const next = new Set([...s].filter((d) => kindOf(p.files, d) === "folder"));
      return next.size === s.size ? s : next;
    });
  }, [p.files]);

  const toggle = (path: string, open?: boolean) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (open ?? !s.has(path)) next.add(path);
      else next.delete(path);
      return next;
    });

  /** Folder that new items go in, from the focused row. */
  const targetFolder = (path: string | null) => {
    if (!path) return p.activeFile ? dirname(p.activeFile) : "";
    return kindOf(p.files, path) === "folder" ? path : dirname(path);
  };

  const startNew = (kind: "file" | "folder", parent = targetFolder(focused)) => {
    if (parent) setExpanded((s) => new Set([...s, parent, ...ancestors(parent)]));
    setEditing({ mode: "new", kind, parent });
  };

  const newPath = (parent: string, raw: string, kind: "file" | "folder") => {
    const typed = normalizeInput(raw);
    return joinPath(parent, kind === "file" ? withDefaultExtension(typed) : typed);
  };

  /** A rename keeps the folder, and the extension if the new name has none. */
  const renamePath = (from: string, raw: string) => {
    const typed = normalizeInput(raw);
    const isFile = kindOf(p.files, from) === "file";
    const name = isFile && extname(from) && !extname(typed) ? typed + extname(from) : typed;
    return joinPath(dirname(from), name);
  };

  const remove = (path: string) => {
    // Keep the keyboard focus on a neighbouring row.
    const i = rows.findIndex((r) => r.node.path === path);
    const next = rows.slice(i + 1).find((r) => !r.node.path.startsWith(path + "/")) ?? rows[i - 1];
    setFocused(next?.node.path ?? null);
    p.onDelete(path);
    treeRef.current?.focus();
  };

  const upload = (folder: boolean, into: string) => {
    uploadTarget.current = into;
    (folder ? folderInput : fileInput).current?.click();
  };

  // ── menus ──────────────────────────────────────────────────────────────

  const itemMenu = (node: TreeNode): MenuItem[] => {
    const isFolder = node.kind === "folder";
    const dir = isFolder ? node.path : dirname(node.path);
    const items: MenuItem[] = [];
    if (!isFolder) items.push({ label: "Open", onSelect: () => p.onOpen(node.path) });
    items.push(
      { label: "New File…", icon: <FilePlus2 className="w-3.5 h-3.5" />, onSelect: () => startNew("file", dir) },
      { label: "New Folder…", icon: <FolderPlus className="w-3.5 h-3.5" />, onSelect: () => startNew("folder", dir) },
    );
    if (isFolder) items.push({ label: "Upload Files Here…", icon: <Upload className="w-3.5 h-3.5" />, onSelect: () => upload(false, node.path) });
    items.push(
      "separator",
      { label: "Rename…", icon: <Pencil className="w-3.5 h-3.5" />, shortcut: "F2", onSelect: () => setEditing({ mode: "rename", path: node.path }) },
      { label: "Duplicate", icon: <Copy className="w-3.5 h-3.5" />, onSelect: () => p.onDuplicate(node.path) },
      { label: isFolder ? "Download as .zip" : "Download", icon: <Download className="w-3.5 h-3.5" />, onSelect: () => p.onDownload(node.path) },
      { label: "Copy Path", icon: <ClipboardCopy className="w-3.5 h-3.5" />, onSelect: () => p.onCopyPath(node.path) },
    );
    if (!isFolder && node.path.endsWith(".bit")) {
      items.push({
        label: p.entry === node.path ? "Entry Point (runs on Run)" : "Set as Entry Point",
        icon: <Play className="w-3.5 h-3.5" />,
        disabled: p.entry === node.path,
        onSelect: () => p.onSetEntry(node.path),
      });
    }
    items.push("separator", { label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, shortcut: "Del", danger: true, onSelect: () => remove(node.path) });
    return items;
  };

  const rootMenu = (): MenuItem[] => [
    { label: "New File…", icon: <FilePlus2 className="w-3.5 h-3.5" />, onSelect: () => startNew("file", "") },
    { label: "New Folder…", icon: <FolderPlus className="w-3.5 h-3.5" />, onSelect: () => startNew("folder", "") },
    "separator",
    { label: "Upload Files…", icon: <Upload className="w-3.5 h-3.5" />, onSelect: () => upload(false, "") },
    { label: "Upload Folder…", icon: <FolderUp className="w-3.5 h-3.5" />, onSelect: () => upload(true, "") },
    { label: "Download Project (.zip)", icon: <Download className="w-3.5 h-3.5" />, onSelect: () => p.onDownload("") },
    "separator",
    { label: "Collapse All", icon: <ChevronsDownUp className="w-3.5 h-3.5" />, onSelect: () => setExpanded(new Set()) },
  ];

  // ── keyboard ───────────────────────────────────────────────────────────

  const onKeyDown = (e: KeyboardEvent) => {
    if (editing) return;
    const i = rows.findIndex((r) => r.node.path === focused);
    const row = rows[i];
    const go = (j: number) => {
      const r = rows[Math.max(0, Math.min(rows.length - 1, j))];
      if (!r) return;
      setFocused(r.node.path);
      document.getElementById(rowId(r.node.path))?.scrollIntoView({ block: "nearest" });
    };
    const mod = e.ctrlKey || e.metaKey;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        go(i + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        go(i < 0 ? rows.length - 1 : i - 1);
        break;
      case "Home":
        e.preventDefault();
        go(0);
        break;
      case "End":
        e.preventDefault();
        go(rows.length - 1);
        break;
      case "ArrowRight":
        if (!row) break;
        e.preventDefault();
        if (row.node.kind === "folder") {
          if (!expanded.has(row.node.path)) toggle(row.node.path, true);
          else if (row.node.children.length) go(i + 1);
        }
        break;
      case "ArrowLeft":
        if (!row) break;
        e.preventDefault();
        if (row.node.kind === "folder" && expanded.has(row.node.path)) toggle(row.node.path, false);
        else if (dirname(row.node.path)) go(rows.findIndex((r) => r.node.path === dirname(row.node.path)));
        break;
      case "Enter":
      case " ":
        if (!row) break;
        e.preventDefault();
        if (row.node.kind === "folder") toggle(row.node.path);
        else p.onOpen(row.node.path);
        break;
      case "F2":
        if (!row) break;
        e.preventDefault();
        setEditing({ mode: "rename", path: row.node.path });
        break;
      case "Delete":
        if (!row) break;
        e.preventDefault();
        remove(row.node.path);
        break;
      case "Backspace":
        if (!row || !mod) break;
        e.preventDefault();
        remove(row.node.path);
        break;
      case "ContextMenu":
        if (!row) break;
        e.preventDefault();
        {
          const r = document.getElementById(rowId(row.node.path))?.getBoundingClientRect();
          if (r) menu.open({ clientX: r.left + 24, clientY: r.bottom, preventDefault() {}, stopPropagation() {} }, itemMenu(row.node));
        }
        break;
    }
  };

  // ── drag and drop ──────────────────────────────────────────────────────

  const dragged = useRef<string | null>(null);

  const canDropInto = (folder: string, e: DragEvent) => {
    const types = [...e.dataTransfer.types];
    if (types.includes("Files")) return true;
    const src = dragged.current;
    if (!src || !types.includes(DRAG_TYPE)) return false;
    if (dirname(src) === folder) return false; // already there
    if (folder === src || folder.startsWith(src + "/")) return false; // into itself
    return true;
  };

  const onDragOver = (folder: string) => (e: DragEvent) => {
    if (!canDropInto(folder, e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = [...e.dataTransfer.types].includes("Files") ? "copy" : "move";
    if (dropTarget !== folder) {
      setDropTarget(folder);
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
      // Hovering a closed folder opens it, so files can be dropped deeper.
      if (folder && !expanded.has(folder)) hoverTimer.current = setTimeout(() => toggle(folder, true), 600);
    }
  };

  const onDrop = (folder: string) => async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const src = dragged.current;
    dragged.current = null;
    if ([...e.dataTransfer.types].includes(DRAG_TYPE) && src) {
      const to = joinPath(folder, basename(src));
      const problem = pathProblem(p.files, to, kindOf(p.files, src) === "folder" ? "folder" : "file", src);
      if (problem) p.onError(problem);
      else p.onMove(src, to);
      return;
    }
    if (e.dataTransfer.types.includes("Files")) {
      const picked = await fromDrop(e.dataTransfer);
      if (picked.length) p.onImport(picked, folder);
    }
  };

  const onDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setDropTarget(null);
      if (hoverTimer.current) clearTimeout(hoverTimer.current);
    }
  };

  // ── rendering ──────────────────────────────────────────────────────────

  const renderNew = (depth: number) =>
    editing?.mode === "new" ? (
      <InlineInput
        key="__new__"
        initial=""
        depth={depth}
        icon={editing.kind === "folder" ? <FileIcon path="" folder /> : <FileIcon path="x.bit" />}
        validate={(v) => pathProblem(p.files, newPath(editing.parent, v, editing.kind), editing.kind)}
        onCommit={(v) => {
          const path = newPath(editing.parent, v, editing.kind);
          setEditing(null);
          p.onCreate(path, editing.kind);
          setFocused(path);
        }}
        onCancel={() => {
          setEditing(null);
          treeRef.current?.focus();
        }}
      />
    ) : null;

  const out: ReactNode[] = [];
  if (editing?.mode === "new" && editing.parent === "") out.push(renderNew(0));
  for (const { node, depth } of rows) {
    const isFolder = node.kind === "folder";
    const open = isFolder && expanded.has(node.path);
    if (editing?.mode === "rename" && editing.path === node.path) {
      out.push(
        <InlineInput
          key={node.path}
          initial={node.name}
          depth={depth}
          icon={<FileIcon path={node.path} folder={isFolder} open={open} />}
          validate={(v) => pathProblem(p.files, renamePath(node.path, v), isFolder ? "folder" : "file", node.path)}
          onCommit={(v) => {
            const to = renamePath(node.path, v);
            setEditing(null);
            if (to !== node.path) p.onMove(node.path, to);
            setFocused(to);
            treeRef.current?.focus();
          }}
          onCancel={() => {
            setEditing(null);
            treeRef.current?.focus();
          }}
        />,
      );
    } else {
      const problems = isFolder ? (open ? null : folderProblems(p.problems, node.path)) : p.problems.get(node.path);
      const isActive = !isFolder && node.path === p.activeFile;
      const dropFolder = isFolder ? node.path : dirname(node.path);
      out.push(
        <div
          key={node.path}
          id={rowId(node.path)}
          role="treeitem"
          aria-level={depth + 1}
          aria-expanded={isFolder ? open : undefined}
          aria-selected={isActive}
          draggable
          onDragStart={(e) => {
            dragged.current = node.path;
            e.dataTransfer.setData(DRAG_TYPE, node.path);
            e.dataTransfer.setData("text/plain", node.path);
            e.dataTransfer.effectAllowed = "copyMove";
          }}
          onDragEnd={() => {
            dragged.current = null;
            setDropTarget(null);
          }}
          onDragOver={onDragOver(dropFolder)}
          onDrop={onDrop(dropFolder)}
          onClick={() => {
            setFocused(node.path);
            if (isFolder) toggle(node.path);
            else p.onOpen(node.path);
          }}
          onContextMenu={(e) => {
            setFocused(node.path);
            menu.open(e, itemMenu(node));
          }}
          title={node.path}
          className={cx(
            "group relative flex items-center gap-1.5 h-[26px] pr-1 cursor-pointer select-none text-[12.5px]",
            isActive ? "bg-active text-fg" : "text-fg/90 hover:bg-hover",
            focused === node.path && "outline outline-1 -outline-offset-1 outline-[var(--focus)]",
            dropTarget !== null && dropFolder === dropTarget && "bg-accent-soft",
          )}
          style={{ paddingLeft: 8 + depth * INDENT }}
        >
          {/* indent guides */}
          {Array.from({ length: depth }, (_, d) => (
            <span key={d} aria-hidden className="absolute top-0 bottom-0 w-px bg-line group-hover:bg-line-strong" style={{ left: 8 + d * INDENT + 6 }} />
          ))}
          <span className="w-4 h-4 flex items-center justify-center shrink-0 text-faint">
            {isFolder && <ChevronRight className={cx("w-3.5 h-3.5 transition-transform", open && "rotate-90")} />}
          </span>
          <FileIcon path={node.path} folder={isFolder} open={open} />
          <span className={cx("truncate", problems?.errors ? "text-danger" : problems?.warnings ? "text-warning" : undefined)}>{node.name}</span>
          {!isFolder && node.path === p.entry && (
            <span title="Entry point: Run starts here" className="shrink-0 text-run">
              <Play className="w-3 h-3 fill-current" />
            </span>
          )}
          <span className="flex-1" />
          {problems && (problems.errors > 0 || problems.warnings > 0) && (
            <span
              className={cx("text-[10.5px] font-semibold tabular-nums px-1 group-hover:hidden", problems.errors ? "text-danger" : "text-warning")}
              title={`${problems.errors} error(s), ${problems.warnings} warning(s)`}
            >
              {isFolder ? "●" : problems.errors || problems.warnings}
            </span>
          )}
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Actions for ${node.name}`}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setFocused(node.path);
              menu.open({ clientX: r.left, clientY: r.bottom + 2, preventDefault: () => e.preventDefault(), stopPropagation: () => e.stopPropagation() }, itemMenu(node));
            }}
            className="hidden group-hover:flex w-5 h-5 items-center justify-center rounded text-muted hover:text-fg hover:bg-hover"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>,
      );
      if (isFolder && open && editing?.mode === "new" && editing.parent === node.path) out.push(renderNew(depth + 1));
    }
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center justify-between pl-3 pr-1.5 pt-3 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
          Project <span className="normal-case tracking-normal font-normal">· {fileCount} file{fileCount === 1 ? "" : "s"}</span>
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton label="New file" size="sm" onClick={() => startNew("file")}>
            <FilePlus2 className="w-3.5 h-3.5" />
          </IconButton>
          <IconButton label="New folder" size="sm" onClick={() => startNew("folder")}>
            <FolderPlus className="w-3.5 h-3.5" />
          </IconButton>
          <IconButton label="Upload files or a .zip" size="sm" onClick={() => upload(false, targetFolder(focused))}>
            <Upload className="w-3.5 h-3.5" />
          </IconButton>
          <IconButton label="Download project (.zip)" size="sm" onClick={() => p.onDownload("")}>
            <Download className="w-3.5 h-3.5" />
          </IconButton>
          <IconButton label="Collapse folders" size="sm" onClick={() => setExpanded(new Set())}>
            <ChevronsDownUp className="w-3.5 h-3.5" />
          </IconButton>
        </div>
      </div>

      <div
        ref={treeRef}
        role="tree"
        aria-label="Project files"
        aria-activedescendant={focused ? rowId(focused) : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={() => !focused && rows[0] && setFocused(rows[0].node.path)}
        onContextMenu={(e) => menu.open(e, rootMenu())}
        onDragOver={onDragOver("")}
        onDrop={onDrop("")}
        onDragLeave={onDragLeave}
        className={cx("relative outline-none pb-2 min-h-[64px] rounded-md mx-1", dropTarget === "" && "bg-accent-soft ring-1 ring-accent")}
      >
        {out}
        {rows.length === 0 && !editing && (
          <div className="px-3 py-4 text-center text-[12px] text-faint leading-relaxed">
            No files yet.
            <br />
            <button className="text-accent hover:underline" onClick={() => startNew("file", "")}>
              Create a file
            </button>{" "}
            or drop files here.
          </div>
        )}
      </div>
      <p className="px-3 pt-1 text-[11px] leading-relaxed text-faint">
        Kept in this browser. Drag to move · F2 rename · {MOD}+P go to file.
      </p>

      <input
        ref={fileInput}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = fromInput(e.target.files);
          e.target.value = "";
          if (picked.length) p.onImport(picked, uploadTarget.current);
        }}
      />
      <input
        ref={(el) => {
          folderInput.current = el;
          el?.setAttribute("webkitdirectory", "");
        }}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const picked = fromInput(e.target.files);
          e.target.value = "";
          if (picked.length) p.onImport(picked, uploadTarget.current);
        }}
      />
      {menu.element}
    </div>
  );
}

const rowId = (path: string) => `fx-${path.replace(/[^A-Za-z0-9_-]/g, (c) => `_${c.charCodeAt(0).toString(16)}`)}`;
