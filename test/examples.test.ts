// Every example program, compiled and run by the real compiler through the
// server's job pipeline (server/compiler.ts), must print its .out file.
// Also checks that `format` leaves the examples as they are, and the
// diagnostics a broken program gets.
//
//   npm run test:examples                     (needs `biton` on PATH or BITON_BIN)
//   UPDATE_EXAMPLES=1 npm run test:examples   rewrites the .out files

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EXAMPLES } from "../src/examples/manifest.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "examples");
const update = process.env.UPDATE_EXAMPLES === "1";

// The job pipeline reads its configuration when it is first imported.
process.env.NODE_ENV = "test";
process.env.BITON_SANDBOX = "none";
process.env.JOB_ROOT = mkdtempSync(path.join(tmpdir(), "biton-examples-"));
process.env.RUN_TIMEOUT_MS ??= "10000";
const bin = process.env.BITON_BIN || "biton";
const available = spawnSync(bin, ["--version"]).status === 0;
const skip = !available && `${bin} is not installed`;

let runJob: typeof import("../server/compiler.ts").runJob;
before(async () => {
  if (!available) return;
  ({ runJob } = await import("../server/compiler.ts"));
  const { initSandbox } = await import("../server/sandbox.ts");
  await initSandbox();
});

for (const ex of EXAMPLES) {
  test(`example ${ex.key} runs`, { skip }, async () => {
    const code = readFileSync(path.join(dir, `${ex.key}.bit`), "utf8");
    const res = await runJob({ code, mode: "run", opt: "O2", stdin: ex.stdin, args: ex.args });
    assert.deepEqual(res.diagnostics, [], res.diagnostics.map((d) => d.rendered).join("\n"));
    assert.equal(res.failedAt, null, res.compilerOutput);
    const run = res.run!;
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.stderr, "");
    const golden = path.join(dir, `${ex.key}.out`);
    if (update) writeFileSync(golden, run.stdout);
    assert.equal(run.stdout, readFileSync(golden, "utf8"));
  });

  test(`example ${ex.key} is formatted`, { skip }, async () => {
    const code = readFileSync(path.join(dir, `${ex.key}.bit`), "utf8");
    const res = await runJob({ code, mode: "format" });
    assert.equal(res.success, true, res.compilerOutput);
    assert.equal(res.formatted, code);
  });
}

test("format reformats code", { skip }, async () => {
  const res = await runJob({ code: "fn main()   int {\n  x:=1\n      return x\n}\n", mode: "format" });
  assert.equal(res.formatted, "fn main() int {\n    x := 1\n    return x\n}\n");
});

test("diagnostics point into main.bit", { skip }, async () => {
  const res = await runJob({ code: "fn main() int {\n    return nope\n}\n", mode: "check" });
  assert.equal(res.success, false);
  assert.equal(res.diagnostics.length, 1);
  const d = res.diagnostics[0];
  assert.equal(d.file, "main.bit");
  assert.deepEqual([d.severity, d.code, d.line, d.col, d.endCol], ["error", null, 2, 12, 16]);
  assert.match(d.message, /nope/);
  assert.doesNotMatch(d.rendered, new RegExp(process.env.JOB_ROOT!));
});

test("old syntax gets the compiler's hint", { skip }, async () => {
  const res = await runJob({ code: "def main() => int {\n    give 0;\n}\n", mode: "check" });
  assert.equal(res.success, false);
  assert.ok(res.diagnostics.some((d) => d.notes.some((n) => n.startsWith("help:"))));
});

test("a crash is a failed run, a non-zero exit is not", { skip }, async () => {
  const exit = await runJob({ code: "fn main() int { return 3 }\n", mode: "run" });
  assert.deepEqual([exit.success, exit.run?.exitCode], [true, 3]);
  const oob = await runJob({ code: "fn main() int {\n    xs := [1, 2]\n    i := 5\n    return xs[i]\n}\n", mode: "run" });
  assert.notEqual(oob.run?.exitCode, 0);
  assert.match(oob.run!.stderr, /index|bounds|range/i);
});

// The new-project templates (src/templates): the multi-file starter goes
// through the job pipeline as a project, with nested files and imports.
const templates = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "templates");

test("template blank runs", { skip }, async () => {
  const res = await runJob({ code: readFileSync(path.join(templates, "blank.bit"), "utf8"), mode: "run" });
  assert.equal(res.failedAt, null, res.diagnostics.map((d) => d.rendered).join("\n"));
  assert.equal(res.run!.stdout, "Hello, Biton!\n");
});

test("template starter runs as a multi-file project", { skip }, async () => {
  const read = (p: string) => readFileSync(path.join(templates, "starter", p), "utf8");
  const res = await runJob({
    code: read("main.bit"),
    entry: "main.bit",
    files: { "greet.bit": read("greet.bit"), "geometry/shapes.bit": read("geometry/shapes.bit") },
    mode: "run",
  });
  assert.equal(res.failedAt, null, res.diagnostics.map((d) => d.rendered).join("\n") + res.compilerOutput);
  assert.equal(res.run!.stdout, "Hello, Biton!\narea: 12\nperimeter: 14\n");
});

test("a diagnostic in an imported module names that module", { skip }, async () => {
  const res = await runJob({
    code: "import geometry.shapes\nfn main() int { return shapes.area(1, 2) }\n",
    files: { "geometry/shapes.bit": 'fn area(w: int, h: int) int {\n    return "x"\n}\n' },
    mode: "check",
  });
  assert.equal(res.success, false);
  assert.equal(res.diagnostics[0].file, "geometry/shapes.bit");
  assert.equal(res.diagnostics[0].line, 2);
});

// The game template: a multi-file project played through the job pipeline.
function cryptProject() {
  const root = path.join(templates, "crypt");
  const read = (p: string) => readFileSync(path.join(root, p), "utf8");
  const modules = ["world", "dungeon", "path", "rules", "autopilot"];
  return {
    code: read("main.bit"),
    files: Object.fromEntries(modules.map((m) => [`crypt/${m}.bit`, read(`crypt/${m}.bit`)])),
  };
}

test("template crypt: the autopilot wins the default dungeon", { skip }, async () => {
  const res = await runJob({ ...cryptProject(), mode: "run", args: ["33"] });
  assert.equal(res.failedAt, null, res.diagnostics.map((d) => d.rendered).join("\n") + res.compilerOutput);
  assert.deepEqual(res.diagnostics, [], "no warnings either");
  const out = res.run!.stdout;
  assert.match(out, /^CRYPT OF THE BITON CRYSTAL {3}\(seed 33\)/);
  assert.match(out, /No moves on stdin: the autopilot plays\./);
  assert.match(out, /You descend the stairs to depth 3\./);
  assert.match(out, /\*\*\* VICTORY! You escaped with the Biton Crystal in \d+ turns\. \*\*\*/);
  assert.equal(res.run!.exitCode, 0);
});

test("template crypt: typed moves are played before the autopilot", { skip }, async () => {
  const res = await runJob({ ...cryptProject(), mode: "run", args: ["33"], stdin: "wwwwww\nddddd\n" });
  const out = res.run!.stdout;
  assert.match(out, /You can't go north: there's a wall\./);
  assert.equal(out.match(/You can't go north/g)!.length, 1, "a wall is reported once, not per key");
  assert.match(out, /Your moves are used up\. Here is where they took you:/);
  assert.match(out, /The autopilot takes over\./);
});

test("template crypt: another seed is another dungeon", { skip }, async () => {
  const a = await runJob({ ...cryptProject(), mode: "run", args: ["1"] });
  const b = await runJob({ ...cryptProject(), mode: "run", args: ["2"] });
  const map = (s: string) => s.split("\n").slice(3, 22).join("\n");
  assert.notEqual(map(a.run!.stdout), map(b.run!.stdout));
  const again = await runJob({ ...cryptProject(), mode: "run", args: ["1"] });
  assert.equal(again.run!.stdout, a.run!.stdout, "the same seed plays the same game");
});

test("template crypt: every module is formatted", { skip }, async () => {
  const p = cryptProject();
  for (const [name, code] of [["main.bit", p.code], ...Object.entries(p.files)]) {
    const res = await runJob({ code, entry: name, files: p.files, mode: "format" });
    assert.equal(res.formatted, code, `${name} is not biton fmt-clean`);
  }
});
