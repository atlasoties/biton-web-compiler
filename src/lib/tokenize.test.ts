import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { KEYWORDS, LITERALS, TYPES, tokenize, type TokenClass } from "./tokenize.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.join(here, "..", "examples");

const classes = (src: string) => tokenize(src).filter((t) => t.cls !== "space").map((t) => [t.cls, t.text] as [TokenClass, string]);

test("tokens always concatenate back to the source", () => {
  const samples = [
    ...readdirSync(examplesDir).filter((f) => f.endsWith(".bit")).map((f) => readFileSync(path.join(examplesDir, f), "utf8")),
    `"unterminated {x`,
    `"a {b {c}`,
    "/* /* nested */ still",
    `'\\`,
    `"""multi\nline`,
    "x := 1 ✓ 😀 変数",
    "}}}{{{",
  ];
  for (const s of samples) assert.equal(tokenize(s).map((t) => t.text).join(""), s);
});

test("interpolated strings highlight their expressions", () => {
  assert.deepEqual(classes(`"x = {a + f(b)}!"`), [
    ["string", `"x = `],
    ["interp", "{"],
    ["ident", "a"],
    ["operator", "+"],
    ["function", "f"],
    ["punct", "("],
    ["ident", "b"],
    ["punct", ")"],
    ["interp", "}"],
    ["string", `!"`],
  ]);
  // Braces inside the expression nest; `\{` is a literal brace.
  assert.deepEqual(
    classes(`"{ P(x: 1).x } \\{"`).map(([c]) => c),
    ["string", "interp", "typeName", "punct", "ident", "punct", "number", "punct", "punct", "ident", "interp", "string", "escape", "string"],
  );
  // A multi-line string has no interpolation.
  assert.deepEqual(classes(`"""{x}"""`), [["string", `"""{x}"""`]]);
});

test("current syntax", () => {
  const src = [
    "@copy type P { x: int }",
    "fn f[T: Ord](a: T) T { return a }",
    "fn(int) int",
    "try f(1)",
    "Option.Some(v) -> 1",
    "extend P { }",
    "for i in 1..=3 { }",
    "x := a ?? b",
    "x := c ? 1 : 2",
    "x := 'c'",
  ].join("\n");
  const c = classes(src);
  const of = (text: string) => c.find(([, t]) => t === text)?.[0];
  assert.equal(of("@copy"), "attribute");
  assert.equal(of("type"), "keyword");
  assert.equal(of("fn"), "keyword");
  assert.equal(of("f"), "function");
  assert.equal(of("Ord"), "typeName");
  assert.equal(of("return"), "keyword");
  assert.equal(of("try"), "keyword");
  assert.equal(of("extend"), "keyword");
  assert.equal(of("Option"), "typeName");
  assert.equal(of("Some"), "typeName");
  assert.equal(of("->"), "arrow");
  assert.equal(of(":="), "operator");
  assert.equal(of("..="), "operator");
  assert.equal(of("??"), "operator");
  assert.equal(of("'c'"), "string");
  // Old spellings are plain identifiers now.
  for (const old of ["def", "give", "kind", "fix", "redo", "exit"]) assert.equal(of(old) ?? classes(old)[0][0], "ident", old);
});

test("legacy spellings stay highlighted for diagnostics", () => {
  const c = classes("impl Show for P { }\nclosure(int) int\nOption::Some(v)");
  const of = (text: string) => c.find(([, t]) => t === text)?.[0];
  assert.equal(of("impl"), "keyword");
  assert.equal(of("closure"), "keyword");
  assert.equal(of("::"), "path");
});

// When the biton repository is checked out next to this one, the keyword
// table must match its lexer's exactly.
const lexer = path.join(here, "..", "..", "..", "biton", "compiler", "lexer", "src", "Lexer.cpp");
test("keywords match the biton lexer", { skip: !existsSync(lexer) && "../biton not checked out" }, () => {
  const src = readFileSync(lexer, "utf8");
  const table = src.slice(src.indexOf("keyword_table()"), src.indexOf("};", src.indexOf("keyword_table()")));
  const words = new Set([...table.matchAll(/\{"([a-z0-9_]+)",\s*TokenKind::/g)].map((m) => m[1]));
  assert.ok(words.size > 30, "could not read the keyword table");
  const ours = new Set([...KEYWORDS, ...LITERALS, ...TYPES]);
  assert.deepEqual([...words].filter((w) => !ours.has(w)).sort(), [], "keywords the highlighter is missing");
  assert.deepEqual([...ours].filter((w) => !words.has(w)).sort(), [], "highlighter keywords the lexer does not have");
});
