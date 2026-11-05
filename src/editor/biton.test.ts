import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { EditorState, EditorSelection } from "@codemirror/state";
import { ensureSyntaxTree, foldable, getIndentation, highlightingFor } from "@codemirror/language";
import { CompletionContext } from "@codemirror/autocomplete";
import { highlightTree } from "@lezer/highlight";

import { biton, bitonHighlight } from "./biton.ts";

const examples = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "examples");
const state = (doc: string, pos = doc.length) => EditorState.create({ doc, selection: EditorSelection.cursor(pos), extensions: [biton()] });

/** [text, highlight class] for every highlighted token. */
function tokens(doc: string): Array<[string, string]> {
  const s = state(doc);
  const tree = ensureSyntaxTree(s, doc.length, 5000)!;
  const out: Array<[string, string]> = [];
  highlightTree(tree, bitonHighlight, (from, to, cls) => out.push([doc.slice(from, to), cls]));
  return out;
}

const classOf = (doc: string, text: string) => {
  const t = tokens(doc).find(([x]) => x === text);
  return t?.[1];
};

test("highlights every example without gaps in its keywords", () => {
  for (const f of readdirSync(examples).filter((n) => n.endsWith(".bit"))) {
    const doc = readFileSync(path.join(examples, f), "utf8");
    const toks = tokens(doc);
    assert.ok(toks.length > 50, f);
    for (const kw of ["fn", "return"]) {
      if (new RegExp(`\\b${kw}\\b`).test(doc)) assert.ok(toks.some(([t]) => t === kw), `${f}: ${kw}`);
    }
  }
});

test("token kinds", () => {
  const doc = 'import std.io\n@copy type P { x: int }\nfn f[T](a: T) T { return a }\nx := "a {b + c(1)} \\n" // note\n/* outer /* inner */ still\ncomment */ done';
  const kw = classOf(doc, "fn")!;
  assert.equal(classOf(doc, "return"), kw);
  assert.notEqual(classOf(doc, "int"), undefined);
  assert.notEqual(classOf(doc, "P"), classOf(doc, "x"));
  assert.equal(classOf(doc, "@copy") !== undefined, true);
  // interpolation braces are their own token; the expression inside is code
  assert.equal(classOf(doc, "{"), classOf(doc, "}"));
  assert.notEqual(classOf(doc, "c"), classOf(doc, '"a '));
  assert.equal(classOf(doc, "\\n"), tokens(doc).find(([t]) => t === "\\n")![1]);
  // a nested block comment spans lines; `done` after it is code again
  const toks = tokens(doc);
  const comment = classOf(doc, "// note");
  assert.ok(toks.some(([t, c]) => t.includes("still") && c === comment));
  assert.notEqual(classOf(doc, "done"), comment);
});

test("current syntax tokens", () => {
  const doc = [
    "import std.math.{max}",
    "extend Point: Show { }",
    "fn f() int! { return try g() ?? 0 }",
    "if not ready { }",
    "for i in 0..n { }",
    "for i, x in xs { }",
    "v := Option.Some(1)",
    "x := cond ? a : b",
  ].join("\n");
  assert.equal(classOf(doc, "extend"), classOf(doc, "fn"), "extend is a definition keyword");
  assert.equal(classOf(doc, "try"), classOf(doc, "not"), "try is an operator keyword");
  assert.equal(classOf(doc, "??"), classOf(doc, ":="), "?? is an operator");
  assert.equal(classOf(doc, ".."), classOf(doc, ":="), ".. is an operator");
  assert.equal(classOf(doc, "Option"), classOf(doc, "Point"), "type names");
  assert.notEqual(classOf(doc, "std"), classOf(doc, "Point"), "modules are namespaces");
  assert.equal(classOf(doc, "std"), classOf(doc, "math"), "dot-path module names");
});

function indentAfterEnter(doc: string, at = doc.length): number {
  const s = state(doc, at);
  const tr = s.update({ changes: { from: at, insert: "\n" }, selection: { anchor: at + 1 } });
  return getIndentation(tr.state, at + 1) ?? -1;
}

test("indentation on Enter", () => {
  assert.equal(indentAfterEnter("fn main() int {"), 4);
  assert.equal(indentAfterEnter("fn main() int {\n    x := 1"), 4);
  assert.equal(indentAfterEnter("fn main() int {\n    if x {"), 8);
  assert.equal(indentAfterEnter("fn main() int {\n    if x { // c"), 8);
  assert.equal(indentAfterEnter("fn main() int {\n\n"), 4, "blank lines are skipped");
  // Enter between braces: the new line is indented, `}` goes back
  const doc = "fn main() int {}";
  const at = doc.length - 1;
  assert.equal(indentAfterEnter(doc, at), 0, "the line that starts with } aligns with its opener");
  const s = state("fn f() {\n    x := 1\n}");
  assert.equal(getIndentation(s, s.doc.line(3).from), 0);
});

test("folding a block", () => {
  const s = state("fn main() int {\n    x := 1\n    return x\n}\n");
  const line = s.doc.line(1);
  const range = foldable(s, line.from, line.to);
  assert.deepEqual(range, { from: line.to, to: s.doc.line(4).from });
  assert.equal(foldable(s, s.doc.line(2).from, s.doc.line(2).to), null);
});

test("completion of standard library imports", async () => {
  const complete = async (doc: string) => {
    const s = state(doc);
    const sources = s.languageDataAt<(c: CompletionContext) => unknown>("autocomplete", doc.length);
    const r = (await sources[0](new CompletionContext(s, doc.length, true))) as { options: Array<{ label: string }> } | null;
    return r?.options.map((o) => o.label) ?? [];
  };
  assert.ok((await complete("import std.")).includes("vec"));
  assert.ok((await complete("import std.ve")).includes("vec"));
  const vec = await complete("import std.vec.{");
  assert.ok(vec.includes("Vec") && vec.includes("vec"), vec.join(","));
  assert.ok((await complete("import std.math.{max, s")).includes("sqrt"));
  const words = await complete("fn main() int {\n    counter := 1\n    pri");
  assert.ok(words.includes("print"));
  assert.ok(words.includes("counter"));
  assert.ok((await complete("ext")).includes("extend"));
  assert.deepEqual(await complete('x := "pri'), [], "no completion inside strings");
  void highlightingFor;
});

// When ../biton is checked out next to this repository, the completion list
// must name exactly the public declarations of its standard library.
import { existsSync } from "node:fs";
import { STDLIB_EXPORTS } from "../reference.ts";
const stdlibDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "biton", "stdlib");
test("stdlib exports match ../biton/stdlib", { skip: !existsSync(stdlibDir) && "../biton not checked out" }, () => {
  const actual: Record<string, string[]> = {};
  for (const f of readdirSync(stdlibDir).filter((n) => n.endsWith(".bit"))) {
    const mod = f.slice(0, -4);
    if (mod === "prelude" || mod === "std") continue;
    const src = readFileSync(path.join(stdlibDir, f), "utf8");
    actual[mod] = [...new Set([...src.matchAll(/^pub (?:fn|type|const|trait) ([A-Za-z_]\w*)/gm)].map((m) => m[1]).filter((n) => !n.startsWith("__")))];
  }
  assert.deepEqual(STDLIB_EXPORTS, actual);
});
