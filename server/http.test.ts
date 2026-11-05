import { test } from "node:test";
import assert from "node:assert/strict";

import { validateRequest } from "./http.ts";
import { BadRequest } from "./compiler.ts";

test("accepts every mode and defaults to run", () => {
  assert.equal(validateRequest({ code: "" }).mode, "run");
  for (const mode of ["run", "check", "format"] as const) assert.equal(validateRequest({ code: "x", mode }).mode, mode);
  assert.equal(validateRequest({ code: "x", mode: "emit", emit: "mir" }).emit, "mir");
});

test("rejects bad shapes", () => {
  for (const body of [null, 3, "x", {}, { code: 1 }, { code: "", mode: "exec" }, { code: "", mode: "emit", emit: "asm" }, { code: "", opt: "O9" }, { code: "", stdin: 4 }]) {
    assert.throws(() => validateRequest(body), BadRequest, JSON.stringify(body));
  }
});

test("validates program arguments", () => {
  assert.deepEqual(validateRequest({ code: "", args: ["a", "b c", ""] }).args, ["a", "b c", ""]);
  assert.equal(validateRequest({ code: "", args: [] }).args, undefined);
  for (const args of ["a b", [1], ["a\0b"], Array(65).fill("x"), ["y".repeat(1025)]]) {
    assert.throws(() => validateRequest({ code: "", args }), BadRequest, JSON.stringify(args).slice(0, 40));
  }
});

test("stdin and args only reach runs", () => {
  const r = validateRequest({ code: "", mode: "check", stdin: "in", args: ["a"] });
  assert.equal(r.stdin, undefined);
  assert.equal(r.args, undefined);
  assert.equal(validateRequest({ code: "", mode: "emit", emit: "ir", opt: "O1" }).opt, "O1");
});

test("passes a project's entry and files through", () => {
  const r = validateRequest({ code: "import util.geo", mode: "check", entry: "src/app.bit", files: { "src/util/geo.bit": "fn f() int { return 1 }", "data.txt": "x" } });
  assert.equal(r.entry, "src/app.bit");
  assert.deepEqual(Object.keys(r.files!), ["src/util/geo.bit", "data.txt"]);
  assert.equal(validateRequest({ code: "", files: {} }).files, undefined);
});

test("rejects unsafe or conflicting project paths", () => {
  for (const name of ["../x.bit", "/etc/passwd", "a/../../b", ".hidden", "a//b.bit", "a\\b.bit", "a b.bit", "prog", "x".repeat(201), "a/b/c/d/e/f/g/h/i.bit"]) {
    assert.throws(() => validateRequest({ code: "", files: { [name]: "" } }), BadRequest, name.slice(0, 40));
    assert.throws(() => validateRequest({ code: "", entry: name }), BadRequest, name.slice(0, 40));
  }
  for (const files of [[], "x", { "a.bit": 1 }, { a: "", "a/b.bit": "" }, Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`f${i}.bit`, ""]))]) {
    assert.throws(() => validateRequest({ code: "", files }), BadRequest, JSON.stringify(files).slice(0, 40));
  }
  // The entry itself cannot also be a folder of another file.
  assert.throws(() => validateRequest({ code: "", entry: "lib", files: { "lib/x.bit": "" } }), BadRequest);
  assert.throws(() => validateRequest({ code: "", entry: "lib/x.bit", files: { lib: "" } }), BadRequest);
});
