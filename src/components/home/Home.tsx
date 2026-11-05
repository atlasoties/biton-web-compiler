// The start screen: projects kept in this browser (most recent first), new
// projects from templates, and importing a .zip or folder as a project.

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ArrowRight, ClipboardCopy, Gamepad2, Copy, Download, FileCode2, FolderOpen, FolderUp, Layers, MoreHorizontal, Pencil, Play, Plus, Search, Trash2, Upload, X } from "lucide-react";

import { fromDrop, fromInput, readPicked, type Picked } from "../../lib/importFiles";
import type { ProjectMeta, ProjectStore } from "../../lib/projects";
import { useTheme } from "../../lib/theme";
import type { Auth } from "../../lib/useAuth";
import { BLANK, TEMPLATES, type Template } from "../../templates";
import AccountMenu from "../auth/AccountMenu";
import { useContextMenu, type MenuItem } from "../ContextMenu";
import { PromptDialog } from "../Dialog";
import { ThemeMenu } from "../layout/TopBar";
import { Button, Logo, Wordmark, cx } from "../ui";

interface HomeProps {
  store: ProjectStore;
  auth: Auth;
  onOpen: (id: string) => void;
  notify: (t: { text: string; action?: { label: string; run: () => void }; tone?: "error" }) => void;
  /** Download a stored project as a .zip. */
  onDownload: (id: string) => void;
  /** Bumped by the app when projects change elsewhere (a rename, another tab). */
  version: number;
}

export function timeAgo(t: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { day: "numeric", month: "short", year: d > 300 ? "numeric" : undefined });
}

/** The opening of the game's default dungeon (seed 33), as it prints it. */
const CRYPT_PREVIEW = [
  " #######                       ",
  " #.....#      ############     ",
  " #.....########..........#     ",
  " #..@..............!.....#     ",
  " #.....##.#####.$........#  ###",
  " ########.#   ######.#####  #..",
  "        #.#        #.# ######..",
  "        #.#        #.# #.....O.",
  "    #####.#####    #.###.####..",
  "    #.!.......#    #.#.....##..",
  "    #.........#    #.#..$!.####",
].join("\n");
const PREVIEW_COLORS: Record<string, string> = {
  "@": "text-fg font-bold",
  O: "text-danger font-bold",
  $: "text-warning",
  "!": "text-info",
  "#": "text-faint",
};

const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Folder uploads arrive as "myproject/…": use the folder as the name and drop it from the paths. */
function commonFolder(entries: Array<{ path: string }>): string | null {
  const tops = new Set(entries.map((e) => (e.path.includes("/") ? e.path.split("/")[0] : "")));
  return tops.size === 1 && !tops.has("") ? [...tops][0] : null;
}

export default function Home({ store, auth, onOpen, notify, onDownload, version }: HomeProps) {
  const { pref: themePref, setPref: setThemePref } = useTheme();
  const [projects, setProjects] = useState<ProjectMeta[]>(() => store.list());
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState<ProjectMeta | null>(null);
  const [creating, setCreating] = useState<Template | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [now, setNow] = useState(Date.now());
  const search = useRef<HTMLInputElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const folderInput = useRef<HTMLInputElement | null>(null);
  const menu = useContextMenu();

  const refresh = () => setProjects(store.list());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [version]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => e.key?.startsWith("biton-web-compiler:project") && refresh();
    window.addEventListener("storage", onStorage);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    // "/" jumps to the search box.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        search.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("keydown", onKey);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? projects.filter((p) => p.name.toLowerCase().includes(q) || p.entry?.toLowerCase().includes(q)) : projects;
  }, [projects, query]);
  const usage = useMemo(() => store.usage(), [store, projects]);

  const fullStorage = () => notify({ text: "Browser storage is full. Delete or download projects you no longer need, then try again.", tone: "error" });

  const createFrom = (template: Template, name: string) => {
    const meta = store.create(name, { files: { ...template.files }, stdin: template.stdin, args: template.args?.join(" ") });
    if (!meta) return fullStorage();
    onOpen(meta.id);
  };

  const importPicked = async (picked: Picked[]) => {
    const zipName = picked.length === 1 && /\.zip$/i.test(picked[0].file.name) ? picked[0].file.name.replace(/\.zip$/i, "") : null;
    const { entries, skipped } = await readPicked(picked);
    if (entries.length === 0) {
      notify({ text: `Nothing to import${skipped.length ? `: ${skipped.length} file(s) were not text or too large` : ""}.`, tone: "error" });
      return;
    }
    const folder = commonFolder(entries);
    const files = Object.fromEntries(entries.map((e) => [folder ? e.path.slice(folder.length + 1) : e.path, e.content]));
    const meta = store.create(zipName ?? folder ?? (entries.length === 1 ? entries[0].path.replace(/\.[^.]+$/, "") : "Imported project"), { files });
    if (!meta) return fullStorage();
    notify({ text: `Imported ${entries.length} file${entries.length === 1 ? "" : "s"} as “${meta.name}”${skipped.length ? ` (${skipped.length} skipped)` : ""}` });
    onOpen(meta.id);
  };

  const remove = (p: ProjectMeta) => {
    const backup = store.remove(p.id);
    refresh();
    if (backup)
      notify({
        text: `Deleted “${p.name}”`,
        action: {
          label: "Undo",
          run: () => {
            store.restore(backup);
            refresh();
          },
        },
      });
  };

  const projectMenu = (p: ProjectMeta): MenuItem[] => [
    { label: "Open", icon: <FolderOpen className="w-3.5 h-3.5" />, onSelect: () => onOpen(p.id) },
    { label: "Rename…", icon: <Pencil className="w-3.5 h-3.5" />, onSelect: () => setRenaming(p) },
    {
      label: "Duplicate",
      icon: <Copy className="w-3.5 h-3.5" />,
      onSelect: () => {
        if (!store.duplicate(p.id)) fullStorage();
        refresh();
      },
    },
    { label: "Download (.zip)", icon: <Download className="w-3.5 h-3.5" />, onSelect: () => onDownload(p.id) },
    {
      label: "Copy link",
      icon: <ClipboardCopy className="w-3.5 h-3.5" />,
      onSelect: () => {
        // Only works in this browser: the project is not on the server.
        void navigator.clipboard?.writeText(`${location.origin}${location.pathname}?p=${p.id}`).then(() => notify({ text: "Link copied (opens this project in this browser only; use Share inside the project to send it to someone)" }));
      },
    },
    "separator",
    { label: "Delete", icon: <Trash2 className="w-3.5 h-3.5" />, danger: true, onSelect: () => remove(p) },
  ];

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const picked = await fromDrop(e.dataTransfer);
    if (picked.length) void importPicked(picked);
  };

  const showcase = TEMPLATES.find((t) => t.showcase);
  const starters = TEMPLATES.filter((t) => !t.showcase);
  const last = projects[0];

  return (
    <div
      className="h-dvh flex flex-col bg-bg text-fg overflow-hidden"
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setDragOver(false)}
      onDrop={onDrop}
    >
      <header className="h-12 shrink-0 flex items-center gap-2 px-3 sm:px-5 border-b border-line bg-surface">
        <Logo className="w-7 h-7" />
        <Wordmark className="h-[18px] w-auto" />
        <span className="text-faint text-[13px] hidden sm:inline pl-1 border-l border-line ml-1">Web Compiler</span>
        <div className="flex-1" />
        <ThemeMenu pref={themePref} setPref={setThemePref} />
        <AccountMenu auth={auth.auth} openSignIn={() => auth.openSignIn()} signOut={auth.signOut} />
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
          {/* first visit: the brand */}
          {projects.length === 0 && (
            <div className="flex flex-col items-center text-center pb-8 mb-6 border-b border-line">
              <Logo detailed className="w-24 h-24 sm:w-28 sm:h-28" />
              <Wordmark className="h-9 sm:h-11 w-auto mt-4" />
              <p className="mt-3 text-[14px] text-muted max-w-md">A web IDE for the Biton language: compiled to native code by the real compiler, right from your browser.</p>
            </div>
          )}

          {/* heading */}
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div>
              <h1 className="text-[22px] sm:text-[26px] font-semibold tracking-tight">Projects</h1>
              <p className="text-[13px] text-muted mt-1">
                {projects.length === 0
                  ? "Write, compile and run Biton programs in your browser."
                  : `${projects.length} project${projects.length === 1 ? "" : "s"} in this browser · ${formatBytes(usage)} used`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => fileInput.current?.click()} title="Import a .zip or files as a new project">
                <Upload className="w-3.5 h-3.5" />
                Import
              </Button>
              <Button variant="primary" onClick={() => setCreating(BLANK)}>
                <Plus className="w-4 h-4" />
                New project
              </Button>
            </div>
          </div>

          {/* continue */}
          {last && !query && (
            <button
              type="button"
              onClick={() => onOpen(last.id)}
              className="group mt-6 w-full text-left flex items-center gap-4 p-4 sm:p-5 rounded-xl border border-line bg-surface hover:border-accent hover:shadow-pop transition-all"
            >
              <div className="w-11 h-11 shrink-0 rounded-lg bg-accent-soft flex items-center justify-center">
                <FileCode2 className="w-5 h-5 text-accent" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Continue where you left off</div>
                <div className="text-[16px] font-semibold truncate mt-0.5">{last.name}</div>
                <div className="text-[12.5px] text-muted truncate">
                  {last.fileCount} file{last.fileCount === 1 ? "" : "s"} · edited {timeAgo(last.updatedAt, now)}
                </div>
              </div>
              <span className="hidden sm:flex items-center gap-1.5 text-[13px] font-medium text-accent">
                Open <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          )}

          {/* list */}
          {projects.length > 0 && (
            <section className="mt-8" aria-label="Your projects">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint flex-1">Recent</h2>
                <label className="flex items-center gap-2 h-8 w-full max-w-[260px] px-2.5 rounded-md border border-line bg-surface focus-within:border-accent text-faint">
                  <Search className="w-3.5 h-3.5 shrink-0" />
                  <input
                    ref={search}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setQuery("");
                      if (e.key === "Enter" && shown[0]) onOpen(shown[0].id);
                    }}
                    placeholder="Search projects  /"
                    aria-label="Search projects"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] text-fg placeholder:text-faint"
                  />
                  {query && (
                    <button onClick={() => setQuery("")} aria-label="Clear search" className="hover:text-fg">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </label>
              </div>
              <ul className="rounded-xl border border-line bg-surface divide-y divide-[var(--border)] overflow-hidden">
                {shown.map((p) => (
                  <li key={p.id} onContextMenu={(e) => menu.open(e, projectMenu(p))} className="group flex items-center hover:bg-hover">
                    <button type="button" onClick={() => onOpen(p.id)} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left">
                      <FileCode2 className="w-4 h-4 text-accent shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium truncate">{p.name}</div>
                        <div className="text-[12px] text-faint truncate flex items-center gap-1.5">
                          <span>
                            {p.fileCount} file{p.fileCount === 1 ? "" : "s"}
                          </span>
                          {p.entry && (
                            <>
                              <span>·</span>
                              <Play className="w-2.5 h-2.5 fill-current text-run" />
                              <span className="font-mono">{p.entry}</span>
                            </>
                          )}
                          <span className="hidden sm:inline">· {formatBytes(p.bytes)}</span>
                        </div>
                      </div>
                      <div className="hidden sm:block text-right text-[12px] text-faint shrink-0">
                        <div>edited {timeAgo(p.updatedAt, now)}</div>
                        <div>opened {timeAgo(p.openedAt, now)}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={`Actions for ${p.name}`}
                      onClick={(e) => {
                        const r = e.currentTarget.getBoundingClientRect();
                        menu.open({ clientX: r.right - 200, clientY: r.bottom, preventDefault() {}, stopPropagation() {} }, projectMenu(p));
                      }}
                      className="mr-2 w-8 h-8 shrink-0 rounded-md flex items-center justify-center text-muted hover:text-fg hover:bg-active"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </li>
                ))}
                {shown.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-faint">No project matches “{query}”.</li>}
              </ul>
            </section>
          )}

          {/* new */}
          <section className="mt-10" aria-label="Start a new project">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint mb-2">{projects.length ? "Start something new" : "Start your first project"}</h2>
            {showcase && (
              <button
                type="button"
                onClick={() => setCreating(showcase)}
                className="group w-full mb-3 text-left grid md:grid-cols-[1fr_auto] gap-4 p-4 sm:p-5 rounded-xl border border-line bg-surface hover:border-accent transition-colors overflow-hidden"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Gamepad2 className="w-4 h-4 text-accent" />
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-accent">Game</span>
                  </div>
                  <div className="text-[17px] font-semibold mt-1.5">{showcase.title}</div>
                  <p className="text-[13px] text-muted mt-1.5 leading-relaxed max-w-xl">{showcase.desc}</p>
                  <p className="text-[11.5px] text-faint font-mono mt-3 break-words">{Object.keys(showcase.files).sort().join("  ")}</p>
                  <span className="inline-flex items-center gap-1.5 mt-3 text-[13px] font-medium text-accent">
                    Create and play <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
                <pre
                  aria-hidden="true"
                  className="hidden md:block self-center m-0 px-3 py-2.5 rounded-lg bg-[var(--editor-bg)] border border-line font-mono text-[11px] leading-[1.35] text-muted"
                >
                  {CRYPT_PREVIEW.split("").map((ch, i) => (
                    <span key={i} className={PREVIEW_COLORS[ch]}>
                      {ch}
                    </span>
                  ))}
                </pre>
              </button>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              {starters.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setCreating(t)}
                  className="group text-left p-4 rounded-xl border border-line bg-surface hover:border-accent transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {t.key === "blank" ? <Plus className="w-4 h-4 text-accent" /> : <Layers className="w-4 h-4 text-accent" />}
                    <span className="text-[13.5px] font-semibold">{t.title}</span>
                  </div>
                  <p className="text-[12.5px] text-muted mt-1">{t.desc}</p>
                  <p className="text-[11.5px] text-faint font-mono mt-2 truncate">{Object.keys(t.files).join("  ")}</p>
                </button>
              ))}
              <button
                type="button"
                onClick={() => folderInput.current?.click()}
                className="text-left p-4 rounded-xl border border-dashed border-line-strong hover:border-accent transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FolderUp className="w-4 h-4 text-accent" />
                  <span className="text-[13.5px] font-semibold">Open a folder</span>
                </div>
                <p className="text-[12.5px] text-muted mt-1">Import a folder of .bit files (or drop a folder or .zip anywhere on this page)</p>
              </button>
            </div>
          </section>

          <p className="mt-10 text-[12px] text-faint leading-relaxed max-w-2xl">
            Projects are saved in this browser only, not on the server. Download a project as a .zip to back it up or move it to another computer, and import it
            here to continue. Clearing site data removes them.
          </p>
        </div>
      </main>

      {dragOver && (
        <div className="pointer-events-none fixed inset-3 z-40 rounded-2xl border-2 border-dashed border-accent bg-accent-soft flex items-center justify-center">
          <span className="px-4 py-2 rounded-lg bg-surface shadow-pop text-[14px] font-medium">Drop to import as a new project</span>
        </div>
      )}

      {creating && (
        <PromptDialog
          title={creating.key === "blank" ? "New project" : `New project: ${creating.title}`}
          description={creating.key === "blank" ? "Starts with a main.bit you can run straight away." : creating.desc}
          label="Project name"
          initialValue={store.uniqueName(creating.key === "blank" ? "Untitled project" : creating.title)}
          confirmLabel="Create"
          validate={(v) => (v.trim().length > 80 ? "Use at most 80 characters." : null)}
          onConfirm={(name) => {
            const t = creating;
            setCreating(null);
            createFrom(t, name);
          }}
          onClose={() => setCreating(null)}
        />
      )}

      {renaming && (
        <PromptDialog
          title="Rename project"
          label="Project name"
          initialValue={renaming.name}
          confirmLabel="Rename"
          validate={(v) => (v.trim().length > 80 ? "Use at most 80 characters." : null)}
          onConfirm={(name) => {
            store.rename(renaming.id, name);
            setRenaming(null);
            refresh();
          }}
          onClose={() => setRenaming(null)}
        />
      )}

      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".zip,.bit,.txt,.md,.json,.toml,text/*,application/zip"
        className="hidden"
        onChange={(e) => {
          const picked = fromInput(e.target.files);
          e.target.value = "";
          if (picked.length) void importPicked(picked);
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
          if (picked.length) void importPicked(picked);
        }}
      />
      {menu.element}
    </div>
  );
}
