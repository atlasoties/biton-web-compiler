// Projects kept in this browser.
//
//   biton-web-compiler:projects          index: ProjectMeta[] (what the home screen lists)
//   biton-web-compiler:project:<id>      one project's files, tabs, entry, stdin and arguments
//
// Editor and layout preferences stay in the workspace key (storage.ts) and
// are shared by every project. Storage can be missing or full, so reads fall
// back to empty values and writes report failure instead of throwing.

import { sanitizeProject, listFiles, resolveEntry, type Files } from "./project.ts";

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  /** Last change to the project's files. */
  updatedAt: number;
  /** Last time it was opened (the home screen's "recent" order). */
  openedAt: number;
  fileCount: number;
  bytes: number;
  entry: string | null;
}

export interface ProjectDoc {
  files: Files;
  tabs?: string[];
  activeFile?: string | null;
  entry?: string | null;
  recent?: string[];
  stdin?: string;
  args?: string;
}

const INDEX_KEY = "biton-web-compiler:projects";
const DOC_PREFIX = "biton-web-compiler:project:";
const LEGACY_KEYS = ["biton-web-compiler:v4", "biton-web-compiler:v3"];
export const docKey = (id: string) => DOC_PREFIX + id;
export const isProjectKey = (key: string | null, id: string) => key === docKey(id);

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const defaultStore = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

function read<T>(store: Store | null, key: string): T | null {
  try {
    const raw = store?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(store: Store | null, key: string, value: unknown): boolean {
  try {
    if (!store) return false;
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function summarize(doc: ProjectDoc): Pick<ProjectMeta, "fileCount" | "bytes" | "entry"> {
  let bytes = 0;
  for (const v of Object.values(doc.files)) bytes += new TextEncoder().encode(v).length;
  return { fileCount: listFiles(doc.files).length, bytes, entry: resolveEntry(doc.files, doc.entry) };
}

function isMeta(v: unknown): v is ProjectMeta {
  const m = v as ProjectMeta;
  return !!m && typeof m.id === "string" && typeof m.name === "string" && typeof m.openedAt === "number";
}

export class ProjectStore {
  private store: Store | null;
  constructor(store: Store | null = defaultStore()) {
    this.store = store;
  }

  /** Every project, most recently opened first. Moves a pre-projects workspace into a project once. */
  list(): ProjectMeta[] {
    const raw = read<unknown[]>(this.store, INDEX_KEY);
    if (raw === null) return this.migrate();
    return (Array.isArray(raw) ? raw.filter(isMeta) : []).sort((a, b) => b.openedAt - a.openedAt);
  }

  get(id: string): ProjectMeta | null {
    return this.list().find((p) => p.id === id) ?? null;
  }

  load(id: string): ProjectDoc | null {
    const doc = read<ProjectDoc>(this.store, docKey(id));
    if (!doc || typeof doc !== "object") return null;
    return { ...doc, files: sanitizeProject(doc.files).files };
  }

  /** A name not used by another project: "Name", "Name 2", … */
  uniqueName(name: string, except?: string): string {
    const base = name.trim() || "Untitled project";
    const taken = new Set(this.list().filter((p) => p.id !== except).map((p) => p.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
  }

  /** Create a project; returns its meta, or null if storage refused it. */
  create(name: string, doc: ProjectDoc, now = Date.now()): ProjectMeta | null {
    const meta: ProjectMeta = { id: newId(), name: this.uniqueName(name), createdAt: now, updatedAt: now, openedAt: now, ...summarize(doc) };
    if (!write(this.store, docKey(meta.id), doc)) return null;
    if (!this.writeIndex([meta, ...this.list()])) {
      this.store?.removeItem(docKey(meta.id));
      return null;
    }
    return meta;
  }

  /** Save a project's contents; `edited` moves its "last edited" time. */
  save(id: string, doc: ProjectDoc, edited: boolean, now = Date.now()): boolean {
    if (!write(this.store, docKey(id), doc)) return false;
    return this.update(id, { ...summarize(doc), ...(edited ? { updatedAt: now } : {}) });
  }

  update(id: string, patch: Partial<Omit<ProjectMeta, "id">>): boolean {
    const list = this.list();
    const i = list.findIndex((p) => p.id === id);
    if (i === -1) return false;
    list[i] = { ...list[i], ...patch };
    return this.writeIndex(list);
  }

  rename(id: string, name: string): string {
    const unique = this.uniqueName(name, id);
    this.update(id, { name: unique });
    return unique;
  }

  touch(id: string, now = Date.now()) {
    this.update(id, { openedAt: now });
  }

  duplicate(id: string): ProjectMeta | null {
    const meta = this.get(id);
    const doc = this.load(id);
    return meta && doc ? this.create(`${meta.name} copy`, doc) : null;
  }

  /** Delete a project; returns what is needed to restore it. */
  remove(id: string): { meta: ProjectMeta; doc: ProjectDoc } | null {
    const meta = this.get(id);
    const doc = this.load(id);
    if (!meta) return null;
    this.writeIndex(this.list().filter((p) => p.id !== id));
    this.store?.removeItem(docKey(id));
    return { meta, doc: doc ?? { files: {} } };
  }

  restore(backup: { meta: ProjectMeta; doc: ProjectDoc }): boolean {
    if (!write(this.store, docKey(backup.meta.id), backup.doc)) return false;
    return this.writeIndex([backup.meta, ...this.list().filter((p) => p.id !== backup.meta.id)]);
  }

  /** Approximate bytes used by all projects (UTF-16 in storage, so ×2). */
  usage(): number {
    let n = 0;
    for (const p of this.list()) n += (this.store?.getItem(docKey(p.id))?.length ?? 0) * 2;
    return n;
  }

  private writeIndex(list: ProjectMeta[]): boolean {
    return write(this.store, INDEX_KEY, list);
  }

  /** The workspace from before projects existed becomes "My project". */
  private migrate(): ProjectMeta[] {
    const legacy = LEGACY_KEYS.map((k) => read<Record<string, unknown>>(this.store, k)).find((v) => v && (v.files || v.code));
    this.writeIndex([]);
    if (!legacy) return [];
    const files = (legacy.files && typeof legacy.files === "object" ? legacy.files : { "main.bit": legacy.code }) as Files;
    const doc: ProjectDoc = {
      files: sanitizeProject(files).files,
      tabs: Array.isArray(legacy.tabs) ? (legacy.tabs as string[]) : undefined,
      activeFile: typeof legacy.activeFile === "string" ? legacy.activeFile : undefined,
      entry: typeof legacy.entry === "string" ? legacy.entry : undefined,
      stdin: typeof legacy.stdin === "string" ? legacy.stdin : undefined,
      args: typeof legacy.args === "string" ? legacy.args : undefined,
    };
    const meta = this.create("My project", doc);
    return meta ? [meta] : [];
  }
}
