import { test } from "node:test";
import assert from "node:assert/strict";

import { ProjectStore, docKey } from "./projects.ts";

class MemoryStore {
  data = new Map<string, string>();
  full = false;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.full) throw new DOMException("full", "QuotaExceededError");
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

test("create, list by recent use, load and save", () => {
  const mem = new MemoryStore();
  const s = new ProjectStore(mem);
  assert.deepEqual(s.list(), []);
  const a = s.create("Alpha", { files: { "main.bit": "a", "src/": "", "src/x.bit": "x" } }, 1000)!;
  const b = s.create("Beta", { files: { "main.bit": "b" } }, 2000)!;
  assert.deepEqual(s.list().map((p) => p.name), ["Beta", "Alpha"]);
  assert.equal(a.fileCount, 2);
  assert.equal(a.entry, "main.bit");
  s.touch(a.id, 3000);
  assert.deepEqual(s.list().map((p) => p.name), ["Alpha", "Beta"]);
  assert.ok(s.save(b.id, { files: { "main.bit": "bb", "lib.bit": "l" }, stdin: "in" }, true, 4000));
  assert.equal(s.get(b.id)!.fileCount, 2);
  assert.equal(s.get(b.id)!.updatedAt, 4000);
  assert.equal(s.load(b.id)!.stdin, "in");
});

test("names stay unique; rename and duplicate", () => {
  const s = new ProjectStore(new MemoryStore());
  const a = s.create("Demo", { files: { "main.bit": "" } })!;
  assert.equal(s.create("demo", { files: {} })!.name, "demo 2");
  assert.equal(s.rename(a.id, "Demo"), "Demo", "renaming to its own name is fine");
  assert.equal(s.rename(a.id, "demo 2"), "demo 2 2");
  const copy = s.duplicate(a.id)!;
  assert.equal(copy.name, "demo 2 2 copy");
  assert.deepEqual(s.load(copy.id)!.files, s.load(a.id)!.files);
});

test("remove and restore", () => {
  const mem = new MemoryStore();
  const s = new ProjectStore(mem);
  const a = s.create("A", { files: { "main.bit": "x" } })!;
  const backup = s.remove(a.id)!;
  assert.equal(s.list().length, 0);
  assert.equal(mem.getItem(docKey(a.id)), null);
  assert.ok(s.restore(backup));
  assert.equal(s.load(a.id)!.files["main.bit"], "x");
});

test("a full storage refuses a new project without leaving half of it", () => {
  const mem = new MemoryStore();
  const s = new ProjectStore(mem);
  s.list();
  mem.full = true;
  assert.equal(s.create("A", { files: { "main.bit": "x" } }), null);
  mem.full = false;
  assert.deepEqual(s.list(), []);
});

test("the pre-projects workspace becomes “My project” once", () => {
  const mem = new MemoryStore();
  mem.setItem("biton-web-compiler:v4", JSON.stringify({ files: { "main.bit": "old", "my file.bit": "y" }, activeFile: "main.bit", stdin: "s", args: "-v" }));
  const s = new ProjectStore(mem);
  const list = s.list();
  assert.deepEqual(list.map((p) => p.name), ["My project"]);
  const doc = s.load(list[0].id)!;
  assert.equal(doc.files["main.bit"], "old");
  assert.equal(doc.files["my_file.bit"], "y");
  assert.equal(doc.stdin, "s");
  assert.equal(new ProjectStore(mem).list().length, 1, "not migrated twice");
});
