// Files from the user's computer (an upload, a dropped file or folder, or a
// .zip) as project entries. Only UTF-8 text is accepted; binary and oversized
// files are reported back instead of being half-imported.

import { sanitizePath } from "./project";
import { unzip, ZipError } from "./zip";

/** Largest single file accepted (the server's project limit applies on top). */
export const MAX_IMPORT_FILE_BYTES = 512 * 1024;
const MAX_IMPORT_FILES = 500;

export interface Picked {
  /** Path relative to the drop or upload ("folder/a.bit" for a dropped folder). */
  path: string;
  file: File;
}

export interface ImportResult {
  entries: Array<{ path: string; content: string }>;
  skipped: Array<{ path: string; reason: string }>;
}

/** Files chosen with <input type="file"> (with `webkitdirectory`, their folder paths are kept). */
export function fromInput(list: FileList | null): Picked[] {
  return [...(list ?? [])].map((file) => ({ path: file.webkitRelativePath || file.name, file }));
}

/** Files and folders dropped on the page. */
export async function fromDrop(dt: DataTransfer): Promise<Picked[]> {
  const entries = [...dt.items]
    .filter((i) => i.kind === "file")
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e);
  if (entries.length === 0) return [...dt.files].map((file) => ({ path: file.name, file }));
  const out: Picked[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (out.length >= MAX_IMPORT_FILES) return;
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      out.push({ path: prefix + entry.name, file });
    } else if (entry.isDirectory) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") return; // .git and friends
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      // readEntries returns results in batches until it returns none.
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (batch.length === 0) break;
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      }
    }
  };
  for (const e of entries) await walk(e, "");
  return out;
}

const decoder = new TextDecoder("utf-8", { fatal: true });
function asText(bytes: Uint8Array): string | null {
  try {
    const text = decoder.decode(bytes);
    // NUL bytes mean binary even when they happen to be valid UTF-8.
    return text.includes("\0") ? null : text.replace(/^﻿/, "");
  } catch {
    return null;
  }
}

/** Read picked files into text entries; .zip archives are expanded in place. */
export async function readPicked(picked: Picked[]): Promise<ImportResult> {
  const result: ImportResult = { entries: [], skipped: [] };
  const add = (path: string, bytes: Uint8Array) => {
    if (result.entries.length >= MAX_IMPORT_FILES) return result.skipped.push({ path, reason: `more than ${MAX_IMPORT_FILES} files` });
    if (bytes.length > MAX_IMPORT_FILE_BYTES) return result.skipped.push({ path, reason: "too large" });
    const text = asText(bytes);
    if (text === null) return result.skipped.push({ path, reason: "not a text file" });
    result.entries.push({ path: sanitizePath(path), content: text });
  };

  for (const { path, file } of picked) {
    if (/\.zip$/i.test(file.name)) {
      try {
        const { entries, skipped } = await unzip(new Uint8Array(await file.arrayBuffer()), MAX_IMPORT_FILE_BYTES);
        // An archive of a single top-level folder imports that folder's contents.
        const names = entries.filter((e) => !e.isDir && !/(^|\/)(__MACOSX|\.)/.test(e.name));
        const tops = new Set(names.map((e) => e.name.split("/")[0]));
        const strip = tops.size === 1 && names.every((e) => e.name.includes("/")) ? `${[...tops][0]}/` : "";
        for (const e of names) add(e.name.slice(strip.length), e.data);
        for (const s of skipped) result.skipped.push({ path: s, reason: "too large or unsupported compression" });
      } catch (e) {
        result.skipped.push({ path, reason: e instanceof ZipError ? e.message : "could not be read" });
      }
      continue;
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      result.skipped.push({ path, reason: "too large" });
      continue;
    }
    add(path, new Uint8Array(await file.arrayBuffer()));
  }
  return result;
}
