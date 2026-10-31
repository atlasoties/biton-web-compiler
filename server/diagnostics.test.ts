// node --test server/*.test.ts
// Inputs are real `biton --no-color` output (biton 1.0.0-beta).

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseDiagnostics } from "./diagnostics.ts";

test("error with help line", () => {
  const out = [
    "error[E0101]: expected `;` after give, found '}'",
    " --> main.bit:6:1",
    "   |",
    " 6 | }",
    "   | ^",
    " = help: add ';' here",
    "",
    "error: aborting due to 1 error",
    "",
  ].join("\n");
  const { diagnostics, other } = parseDiagnostics(out);
  assert.equal(other, "");
  assert.equal(diagnostics.length, 1);
  const d = diagnostics[0];
  assert.equal(d.severity, "error");
  assert.equal(d.code, "E0101");
  assert.equal(d.message, "expected `;` after give, found '}'");
  assert.deepEqual([d.file, d.line, d.col, d.endCol], ["main.bit", 6, 1, 2]);
  assert.deepEqual(d.notes, ["help: add ';' here"]);
  assert.ok(d.rendered.startsWith("error[E0101]"));
  assert.ok(d.rendered.endsWith("= help: add ';' here"));
});

test("caret width gives the end column", () => {
  const out = [
    "error[E0200]: undefined identifier 'nope'",
    " --> main.bit:5:13",
    "   |",
    " 5 |     def y = nope + 1;",
    "   |             ^^^^",
    "",
  ].join("\n");
  const [d] = parseDiagnostics(out).diagnostics;
  assert.deepEqual([d.line, d.col, d.endCol], [5, 13, 17]);
});

test("secondary label becomes a note", () => {
  const out = [
    "error[E9999]: duplicate declaration of 'Box' in module 'ref'",
    " --> main.bit:18:1",
    "    |",
    " 18 | kind Box[T] { value: T };",
    "    | ^^^^^^^^^^^^^^^^^^^^^^^^^",
    " 15 | union Shape { Circle: double, Box: Rect };",
    "    |                               ^^^^^^^^^ previous declaration of 'Box'",
    "",
    "error: aborting due to 1 error",
  ].join("\n");
  const [d] = parseDiagnostics(out).diagnostics;
  assert.equal(d.line, 18);
  assert.equal(d.endCol, 26);
  assert.deepEqual(d.notes, ["previous declaration of 'Box'"]);
});

test("several diagnostics, warnings and unparsed output", () => {
  const out = [
    "warning[E0309]: imported symbol 'print_int' is never used in module 'main'",
    " --> main.bit:4:8",
    "   |",
    " 4 | import std::{print_int};",
    "   |        ^^^^^^^^^^^^^^^^",
    " = help: remove the unused import or use it",
    "",
    "error[E0201]: type mismatch",
    " --> main.bit:3:16",
    "   |",
    " 3 |     x = \"hello\";",
    "   |                ^",
    "",
    "/usr/bin/ld: cannot find -lfoo",
    "error: aborting due to 1 error",
  ].join("\n");
  const { diagnostics, other } = parseDiagnostics(out);
  assert.deepEqual(
    diagnostics.map((d) => [d.severity, d.code, d.line]),
    [
      ["warning", "E0309", 4],
      ["error", "E0201", 3],
    ],
  );
  assert.equal(other, "/usr/bin/ld: cannot find -lfoo");
});

test("ANSI colour codes are ignored", () => {
  const out = "\x1b[1;31merror[E0200]\x1b[0m\x1b[1m: undefined identifier 'x'\x1b[0m\n \x1b[2m--> \x1b[0mmain.bit:1:1\n";
  const [d] = parseDiagnostics(out).diagnostics;
  assert.equal(d.message, "undefined identifier 'x'");
  assert.equal(d.line, 1);
});
