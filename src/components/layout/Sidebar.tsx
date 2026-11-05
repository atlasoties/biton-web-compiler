import { useMemo, useState } from "react";
import { BookOpen, Download, FileCode2, Files, FolderPlus, Library, Plus, Search, Trash2, Upload, X, Copy, Edit2, Folder } from "lucide-react";

import type { Example } from "../../examples";
import { highlight } from "../../lib/highlight";
import { REFERENCE, STDLIB } from "../../reference";
import { ConfirmDialog, PromptDialog } from "../Dialog";
import { IconButton, SectionTitle, cx } from "../ui";

export type SidePanel = "files" | "language" | "stdlib";

const PANELS: Array<{ key: SidePanel; label: string; Icon: typeof Files }> = [
  { key: "files", label: "Files & examples", Icon: Files },
  { key: "language", label: "Language reference", Icon: BookOpen },
  { key: "stdlib", label: "Standard library", Icon: Library },
];

/** The thin vertical bar of panel icons on the far left. */
export function ActivityRail({ active, setActive }: { active: SidePanel | null; setActive: (p: SidePanel | null) => void }) {
  return (
    <nav className="w-12 shrink-0 flex flex-col items-center gap-1 py-2 border-r border-line bg-surface" aria-label="Panels">
      {PANELS.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => setActive(active === key ? null : key)}
          aria-label={label}
          title={label}
          aria-pressed={active === key}
          className={cx(
            "relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
            active === key ? "text-fg bg-active" : "text-faint hover:text-fg hover:bg-hover",
          )}
        >
          {active === key && <span className="absolute -left-[7px] top-2 bottom-2 w-[2px] rounded-full bg-accent" />}
          <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
        </button>
      ))}
    </nav>
  );
}

interface SidebarProps {
  panel: SidePanel;
  close: () => void;
  examples: Example[];
  currentExample: string | null;
  loadExample: (key: string) => void;
  downloadCode: () => void;
  uploadCode: (name: string, text: string) => void;
  fileName: string;
  modified: boolean;
  files?: Record<string, string>;
  activeFile?: string;
  onFileSelect?: (name: string) => void;
  onCreateFile?: (name: string) => void;
  onCreateFolder?: (name: string) => void;
  onDeleteFile?: (name: string) => void;
  onRenameFile?: (oldName: string, newName: string) => void;
  onCopyFile?: (name: string, newName: string) => void;
}

function Snippet({ src }: { src: string }) {
  return <pre className="font-mono text-[11.5px] leading-[1.6] whitespace-pre-wrap break-words text-fg">{highlight(src)}</pre>;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="px-3 pt-3">
      <label className="flex items-center gap-2 h-8 px-2.5 rounded-md border border-line bg-surface-2 focus-within:border-accent text-faint">
        <Search className="w-3.5 h-3.5 shrink-0" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] text-fg placeholder:text-faint"
          spellCheck={false}
        />
        {value && (
          <button onClick={() => onChange("")} aria-label="Clear search" className="hover:text-fg">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </label>
    </div>
  );
}

const matches = (q: string, ...texts: Array<string | undefined>) => {
  const s = q.trim().toLowerCase();
  return !s || texts.some((t) => t?.toLowerCase().includes(s));
};

type FileDialog =
  | { kind: "new-file"; initialValue: string }
  | { kind: "new-folder"; initialValue: string }
  | { kind: "rename"; name: string }
  | { kind: "copy"; name: string }
  | { kind: "delete"; name: string };

/** Folder entries are stored under keys ending in "/". */
const isFolderName = (name: string) => name.endsWith("/");

/** Normalise a typed path: forward slashes, no leading "./" or "/". */
const cleanPath = (raw: string) =>
  raw
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+/, "")
    .replace(/^\.\//, "");

/** Validate the path part of a file or folder name. */
const pathError = (path: string, kind: "file" | "folder") => {
  if (!path) return kind === "file" ? "Enter a file name." : "Enter a folder name.";
  const parts = path.split("/");
  if (parts.some((part) => part === "." || part === "..")) return "Use a name like src/main.bit.";
  if (parts.some((part) => /[<>:"|?*\u0000]/.test(part))) return "That name contains characters that aren't allowed.";
  return null;
};

const withBitExtension = (path: string) => (/\.bit$/i.test(path) ? path : `${path}.bit`);

/** Keep the original extension when a renamed/copied path omits one. */
const withSameExtension = (path: string, original: string) => {
  const base = original.slice(folderOf(original).length);
  const dot = base.lastIndexOf(".");
  const extension = dot > 0 ? base.slice(dot) : "";
  return extension && !/\.[^./]+$/.test(path) ? `${path}${extension}` : path;
};

/** "src/main.bit" -> "src/main_copy.bit" */
const copyName = (name: string) => {
  const dir = folderOf(name);
  const base = name.slice(dir.length);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? `${dir}${base.slice(0, dot)}_copy${base.slice(dot)}` : `${dir}${base}_copy`;
};

/** The directory part of a file path, with its trailing slash. */
const folderOf = (path: string) => {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash + 1);
};

const withoutTrailingSlash = (path: string) => path.replace(/\/+$/, "");

/** A bare file name keeps the folder of the file it was derived from. */
const inOriginalFolder = (path: string, original: string) => {
  const folder = folderOf(original);
  return folder && !path.includes("/") ? `${folder}${path}` : path;
};

export default function Sidebar(p: SidebarProps) {
  const [query, setQuery] = useState("");
  const [fileDialog, setFileDialog] = useState<FileDialog | null>(null);
  const title = PANELS.find((x) => x.key === p.panel)!.label;

  const allFiles = p.files ?? {};
  const hasEntry = (name: string) => Object.prototype.hasOwnProperty.call(allFiles, name);
  /** New entries go next to the active item by default. */
  const defaultDir = p.activeFile ? (isFolderName(p.activeFile) ? p.activeFile : folderOf(p.activeFile)) : "";

  const newFileProblem = (raw: string) => {
    const cleaned = cleanPath(raw);
    if (cleaned.endsWith("/")) return "Enter a file name.";
    const path = withoutTrailingSlash(cleaned);
    const problem = pathError(path, "file");
    if (problem) return problem;
    const name = withBitExtension(path);
    return hasEntry(name) ? `“${name}” already exists.` : null;
  };

  const newFolderProblem = (raw: string) => {
    const path = withoutTrailingSlash(cleanPath(raw));
    const problem = pathError(path, "folder");
    if (problem) return problem;
    const name = `${path}/`;
    const exists = Object.keys(allFiles).some((key) => key === name || key.startsWith(name));
    return exists ? `“${path}” already exists.` : null;
  };

  const renameProblem = (original: string, raw: string) => {
    const isFolder = isFolderName(original);
    const basePath = withoutTrailingSlash(cleanPath(raw));
    const path = isFolder ? basePath : inOriginalFolder(basePath, original);
    const problem = pathError(path, isFolder ? "folder" : "file");
    if (problem) return problem;
    const name = isFolder ? `${path}/` : withSameExtension(path, original);
    if (name === original) return null;
    if (hasEntry(name)) return `“${name}” already exists.`;
    if (isFolder) {
      if (name.startsWith(original)) return "A folder can't be moved inside itself.";
      if (Object.keys(allFiles).some((key) => key !== original && key.startsWith(name))) return `“${path}” already exists.`;
    }
    return null;
  };

  const copyProblem = (original: string, raw: string) => {
    const path = inOriginalFolder(withoutTrailingSlash(cleanPath(raw)), original);
    const problem = pathError(path, "file");
    if (problem) return problem;
    const name = withSameExtension(path, original);
    return hasEntry(name) ? `“${name}” already exists.` : null;
  };

  const createNewFile = (raw: string) => {
    p.onCreateFile?.(withBitExtension(withoutTrailingSlash(cleanPath(raw))));
    setFileDialog(null);
  };

  const createNewFolder = (raw: string) => {
    p.onCreateFolder?.(withoutTrailingSlash(cleanPath(raw)));
    setFileDialog(null);
  };

  const renameTo = (original: string, raw: string) => {
    const isFolder = isFolderName(original);
    const basePath = withoutTrailingSlash(cleanPath(raw));
    const path = isFolder ? basePath : inOriginalFolder(basePath, original);
    const newName = isFolder ? `${path}/` : withSameExtension(path, original);
    setFileDialog(null);
    if (newName !== original) p.onRenameFile?.(original, newName);
  };

  const copyTo = (original: string, raw: string) => {
    const path = inOriginalFolder(withoutTrailingSlash(cleanPath(raw)), original);
    p.onCopyFile?.(original, withSameExtension(path, original));
    setFileDialog(null);
  };

  const deleteFile = (name: string) => {
    p.onDeleteFile?.(name);
    setFileDialog(null);
  };

  const reference = useMemo(
    () =>
      REFERENCE.map((s) => ({ ...s, items: matches(query, s.title) ? s.items : s.items.filter((i) => matches(query, i.code, i.note)) })).filter(
        (s) => s.items.length > 0,
      ),
    [query],
  );
  const stdlib = useMemo(
    () =>
      STDLIB.map((m) => ({ ...m, items: matches(query, m.module) ? m.items : m.items.filter((i) => matches(query, i)) })).filter((m) => m.items.length > 0),
    [query],
  );

  return (
    <aside className="w-72 max-w-[85vw] h-full flex flex-col bg-surface border-r border-line" aria-label={title}>
      <div className="h-10 shrink-0 flex items-center justify-between pl-3 pr-1.5 border-b border-line">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{title}</span>
        <IconButton label="Close panel" size="sm" onClick={p.close}>
          <X className="w-3.5 h-3.5" />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {p.panel === "files" && (
          <>
            <SectionTitle
              right={
                <div className="flex items-center gap-0.5">
                  <IconButton label="New file" size="sm" onClick={() => setFileDialog({ kind: "new-file", initialValue: defaultDir })}>
                    <Plus className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton label="New folder" size="sm" onClick={() => setFileDialog({ kind: "new-folder", initialValue: defaultDir })}>
                    <FolderPlus className="w-3.5 h-3.5" />
                  </IconButton>
                  <IconButton label="Download current file" size="sm" onClick={p.downloadCode}>
                    <Download className="w-3.5 h-3.5" />
                  </IconButton>
                  <label title="Open a .bit file" className="w-6 h-6 inline-flex items-center justify-center rounded-md text-muted hover:text-fg hover:bg-hover cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    <span className="sr-only">Open a .bit file</span>
                    <input
                      type="file"
                      accept=".bit,text/plain"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) file.text().then((text) => p.uploadCode(file.name, text));
                      }}
                    />
                  </label>
                </div>
              }
            >
              Files
            </SectionTitle>
            <div className="px-1.5 space-y-px">
              {Object.keys(allFiles).sort().map((fname) => {
                const isFolder = isFolderName(fname) || Object.keys(allFiles).some((k) => k !== fname && k.startsWith(fname + "/"));
                const isActive = !isFolder && p.activeFile === fname;
                return (
                  <div key={fname} className="group flex items-center gap-1">
                    <button
                      onClick={() => !isFolder && p.onFileSelect?.(fname)}
                      className={cx(
                        "flex-1 text-left px-2 py-1.5 rounded-md transition-colors flex items-center gap-2",
                        isActive ? "bg-active" : "hover:bg-hover",
                        isFolder && "cursor-default",
                      )}
                    >
                      {isFolder ? <Folder className="w-3.5 h-3.5 text-faint shrink-0" /> : <FileCode2 className="w-3.5 h-3.5 text-faint group-hover:text-accent shrink-0" />}
                      <span className="text-[12.5px] text-fg truncate">{fname}</span>
                    </button>
                    <div className="hidden group-hover:flex items-center gap-0.5">
                      {isFolder ? (
                        <IconButton label="New file in folder" size="sm" onClick={() => setFileDialog({ kind: "new-file", initialValue: fname })}>
                          <Plus className="w-3 h-3" />
                        </IconButton>
                      ) : (
                        <IconButton label="Copy" size="sm" onClick={() => setFileDialog({ kind: "copy", name: fname })}>
                          <Copy className="w-3 h-3" />
                        </IconButton>
                      )}
                      <IconButton label="Rename" size="sm" onClick={() => setFileDialog({ kind: "rename", name: fname })}>
                        <Edit2 className="w-3 h-3" />
                      </IconButton>
                      <IconButton label="Delete" size="sm" onClick={() => setFileDialog({ kind: "delete", name: fname })}>
                        <Trash2 className="w-3 h-3" />
                      </IconButton>
                    </div>
                  </div>
                );
              })}
              {Object.keys(allFiles).length === 0 && (
                <div className="px-2 py-1.5 text-[11.5px] text-faint">No files</div>
              )}
            </div>
            <p className="px-3 pt-2 text-[11.5px] leading-relaxed text-faint">
              Multi-file project support. Kept in this browser.
            </p>

            <SectionTitle>Examples</SectionTitle>
            <div className="px-1.5 space-y-px">
              {p.examples.map((ex) => (
                <button
                  key={ex.key}
                  onClick={() => p.loadExample(ex.key)}
                  className={cx(
                    "w-full text-left px-2 py-2 rounded-md transition-colors group",
                    p.currentExample === ex.key ? "bg-active" : "hover:bg-hover",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <FileCode2 className="w-3.5 h-3.5 text-faint group-hover:text-accent shrink-0" />
                    <span className="text-[13px] font-medium text-fg truncate">{ex.title}</span>
                  </div>
                  <div className="pl-[22px] text-[11.5px] leading-snug text-faint mt-0.5">{ex.desc}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {p.panel === "language" && (
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Search the language…" />
            {reference.map((section) => (
              <div key={section.title}>
                <SectionTitle>{section.title}</SectionTitle>
                <div className="px-3 space-y-1.5">
                  {section.items.map((item, i) => (
                    <div key={i} className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
                      <Snippet src={item.code} />
                      {item.note && <div className="text-[11px] text-faint leading-snug mt-0.5">{item.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {reference.length === 0 && <p className="px-3 pt-4 text-[12.5px] text-faint">Nothing matches “{query}”.</p>}
          </>
        )}

        {p.panel === "stdlib" && (
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Search the standard library…" />
            {stdlib.map((m) => (
              <div key={m.module}>
                <SectionTitle>
                  <span className="font-mono normal-case tracking-normal text-[12px] text-fg">{m.module}</span>
                </SectionTitle>
                <div className="px-3 space-y-1.5">
                  <div className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
                    <Snippet src={m.import} />
                  </div>
                  <div className="rounded-md border border-line px-2.5 py-1.5">
                    <Snippet src={m.items.join("\n")} />
                  </div>
                </div>
              </div>
            ))}
            {stdlib.length === 0 && <p className="px-3 pt-4 text-[12.5px] text-faint">Nothing matches “{query}”.</p>}
          </>
        )}
      </div>

      {fileDialog?.kind === "new-file" && (
        <PromptDialog
          title="New file"
          description={
            <>
              Create a file in this browser. Use a path like <span className="font-mono text-fg">src/main.bit</span> to put it in a folder.
            </>
          }
          label="File name"
          initialValue={fileDialog.initialValue}
          placeholder="main.bit"
          confirmLabel="Create file"
          validate={newFileProblem}
          onConfirm={createNewFile}
          onClose={() => setFileDialog(null)}
        />
      )}

      {fileDialog?.kind === "new-folder" && (
        <PromptDialog
          title="New folder"
          description={
            <>
              Group related files together. Use a path like <span className="font-mono text-fg">src/lib</span> to nest folders.
            </>
          }
          label="Folder name"
          initialValue={fileDialog.initialValue}
          placeholder="src"
          confirmLabel="Create folder"
          validate={newFolderProblem}
          onConfirm={createNewFolder}
          onClose={() => setFileDialog(null)}
        />
      )}

      {fileDialog?.kind === "rename" && (
        <PromptDialog
          title={isFolderName(fileDialog.name) ? "Rename folder" : "Rename file"}
          description={
            <>
              Renaming <span className="font-mono text-fg">{fileDialog.name}</span>. The change is kept in this browser.
            </>
          }
          label="New name"
          initialValue={isFolderName(fileDialog.name) ? withoutTrailingSlash(fileDialog.name) : fileDialog.name}
          confirmLabel="Rename"
          validate={(value) => renameProblem(fileDialog.name, value)}
          onConfirm={(value) => renameTo(fileDialog.name, value)}
          onClose={() => setFileDialog(null)}
          selectBasename={!isFolderName(fileDialog.name)}
        />
      )}

      {fileDialog?.kind === "copy" && (
        <PromptDialog
          title="Copy file"
          description={
            <>
              Make a copy of <span className="font-mono text-fg">{fileDialog.name}</span>.
            </>
          }
          label="Copy as"
          initialValue={copyName(fileDialog.name)}
          confirmLabel="Copy"
          validate={(value) => copyProblem(fileDialog.name, value)}
          onConfirm={(value) => copyTo(fileDialog.name, value)}
          onClose={() => setFileDialog(null)}
          selectBasename
        />
      )}

      {fileDialog?.kind === "delete" && (
        <ConfirmDialog
          title={isFolderName(fileDialog.name) ? "Delete folder?" : "Delete file?"}
          description={
            <>
              <span className="font-mono text-fg">{fileDialog.name}</span> will be removed from this browser
              {isFolderName(fileDialog.name) ? ", including everything inside it" : ""}. This can't be undone.
            </>
          }
          confirmLabel="Delete"
          destructive
          onConfirm={() => deleteFile(fileDialog.name)}
          onClose={() => setFileDialog(null)}
        />
      )}
    </aside>
  );
}
