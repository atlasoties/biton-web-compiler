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
