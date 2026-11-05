import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildTree,
  copyPath,
  createFile,
  createFolder,
  deletePath,
  filesUnder,
  freshPath,
  importsOf,
  kindOf,
  listFiles,
  movePath,
  normalizeInput,
  pathProblem,
  resolveEntry,
  sanitizeProject,
  uniquePath,
  visibleRows,
  type Files,
} from "./project.ts";

const project = (): Files => createFile(createFile(createFile({}, "main.bit", "m"), "src/util/geo.bit", "g"), "src/app.bit", "a");

test("creating a file adds its folders", () => {
  assert.deepEqual(Object.keys(project()).sort(), ["main.bit", "src/", "src/app.bit", "src/util/", "src/util/geo.bit"]);
  assert.equal(kindOf(project(), "src/util"), "folder");
  assert.equal(kindOf(project(), "src/app.bit"), "file");
  assert.equal(kindOf(project(), "nope"), null);
  assert.deepEqual(Object.keys(createFolder({}, "a/b")).sort(), ["a/", "a/b/"]);
});

test("files list and tree put folders first in natural order", () => {
  const files = createFile(createFile(createFile(project(), "file10.bit"), "file2.bit"), "Zed/x.bit");
  assert.deepEqual(listFiles(files), ["src/util/geo.bit", "src/app.bit", "Zed/x.bit", "file2.bit", "file10.bit", "main.bit"]);
  const tree = buildTree(files);
  assert.deepEqual(
    tree.map((n) => n.name),
    ["src", "Zed", "file2.bit", "file10.bit", "main.bit"],
  );
  assert.deepEqual(
    visibleRows(tree, new Set(["src"])).map((r) => `${r.depth}:${r.node.name}`),
    ["0:src", "1:util", "1:app.bit", "0:Zed", "0:file2.bit", "0:file10.bit", "0:main.bit"],
  );
});

test("pathProblem catches conflicts, bad names and moves into itself", () => {
  const files = project();
  assert.equal(pathProblem(files, "new.bit", "file"), null);
  assert.match(pathProblem(files, "main.bit", "file")!, /already exists/);
  assert.match(pathProblem(files, "src", "file")!, /folder named “src” already exists/);
  assert.match(pathProblem(files, "main.bit/x.bit", "file")!, /is a file/);
  assert.match(pathProblem(files, "../x.bit", "file")!, /cannot start with a dot/);
  assert.match(pathProblem(files, "a b.bit", "file")!, /letters, digits/);
  assert.equal(pathProblem(files, "main.bit", "file", "main.bit"), null, "renaming to itself is fine");
  assert.match(pathProblem(files, "src/util/inner", "folder", "src")!, /inside itself/);
});

test("moving a folder moves everything inside it and reports each file", () => {
  const { files, moved } = movePath(project(), "src", "lib/code");
  assert.deepEqual(Object.keys(files).sort(), ["lib/", "lib/code/", "lib/code/app.bit", "lib/code/util/", "lib/code/util/geo.bit", "main.bit"]);
  assert.deepEqual([...moved].sort(), [
    ["src/app.bit", "lib/code/app.bit"],
    ["src/util/geo.bit", "lib/code/util/geo.bit"],
  ]);
  assert.equal(files["lib/code/util/geo.bit"], "g");
});

test("renaming a file keeps its content", () => {
  const { files, moved } = movePath(project(), "main.bit", "src/main.bit");
  assert.equal(files["src/main.bit"], "m");
  assert.equal(files["main.bit"], undefined);
  assert.deepEqual([...moved], [["main.bit", "src/main.bit"]]);
});

test("deleting a folder deletes its contents; copying copies them", () => {
  const files = project();
  assert.deepEqual(filesUnder(files, "src").sort(), ["src/app.bit", "src/util/geo.bit"]);
  assert.deepEqual(Object.keys(deletePath(files, "src")), ["main.bit"]);
  assert.deepEqual(Object.keys(deletePath(files, "src/app.bit")).sort(), ["main.bit", "src/", "src/util/", "src/util/geo.bit"]);
  const copy = copyPath(files, "src", "src-copy");
  assert.equal(copy["src-copy/util/geo.bit"], "g");
  assert.equal(copy["src/util/geo.bit"], "g");
});

test("unique and fresh names", () => {
  const files = project();
  assert.equal(uniquePath(files, "src/app.bit"), "src/app-copy.bit");
  assert.equal(uniquePath(createFile(files, "src/app-copy.bit"), "src/app.bit"), "src/app-copy-2.bit");
  assert.equal(uniquePath(files, "src"), "src-copy");
  assert.equal(uniquePath(files, "fresh.bit"), "fresh.bit");
  assert.equal(freshPath(files, "src", "untitled.bit"), "src/untitled.bit");
  assert.equal(freshPath(createFile(files, "untitled.bit"), "", "untitled.bit"), "untitled-2.bit");
});

test("normalizeInput tidies typed paths", () => {
  assert.equal(normalizeInput("  ./src\\\\util//geo.bit/ "), "src/util/geo.bit");
  assert.equal(normalizeInput("/abs"), "abs");
});

test("importsOf resolves modules from the importing file's folder", () => {
  const files = project();
  assert.deepEqual(importsOf(files, "src/app.bit", "import util.geo\nimport std.io\nimport missing\n"), ["src/util/geo.bit"]);
  assert.deepEqual(importsOf(files, "main.bit", "import src.util.geo.{area}\nimport src.app"), ["src/util/geo.bit", "src/app.bit"]);
  // An item import falls back to the module that declares it.
  assert.deepEqual(importsOf(files, "src/app.bit", "import util.geo.area"), ["src/util/geo.bit"]);
});

test("resolveEntry falls back to main.bit, then a top-level source", () => {
  const files = project();
  assert.equal(resolveEntry(files, "src/app.bit"), "src/app.bit");
  assert.equal(resolveEntry(files, "gone.bit"), "main.bit");
  assert.equal(resolveEntry(deletePath(files, "main.bit"), null), null);
  assert.equal(resolveEntry(createFile({}, "hello.bit"), null), "hello.bit");
});

test("sanitizeProject repairs names saved by older versions", () => {
  const { files, renamed } = sanitizeProject({
    "main.bit": "m",
    "my file.bit": "x",
    "../evil.bit": "e",
    "notes/": "",
    "notes/a.bit": "a",
    "data.bit/": "",
    "data.bit": "file named like a folder",
    "bad": 3,
  });
  assert.equal(files["main.bit"], "m");
  assert.equal(files["my_file.bit"], "x");
  assert.equal(files["evil.bit"], "e");
  assert.equal(files["notes/a.bit"], "a");
  assert.equal(kindOf(files, "data.bit"), "folder");
  assert.equal(files["data-renamed.bit"], "file named like a folder");
  assert.equal(files["bad"], undefined);
  assert.equal(renamed.get("my file.bit"), "my_file.bit");
  assert.equal(sanitizeProject(null).files && Object.keys(sanitizeProject(null).files).length, 0);
});
