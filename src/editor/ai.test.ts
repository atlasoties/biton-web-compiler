import { test } from "node:test";
import assert from "node:assert/strict";

import { EditorSelection, EditorState } from "@codemirror/state";

import { acceptSuggestion, nextWordLength, requestAt, setSuggestion, suggestionField, wantsSuggestion } from "./ai.ts";

const at = (doc: string, pos = doc.length) => EditorState.create({ doc, selection: EditorSelection.cursor(pos), extensions: [suggestionField] });

function withSuggestion(doc: string, text: string) {
  const s = at(doc);
  return s.update({ effects: setSuggestion.of({ pos: doc.length, text }) }).state;
}

test("typing the suggested characters keeps the rest of the suggestion", () => {
  let s = withSuggestion("x := ", "compute(1)");
  s = s.update({ changes: { from: 5, insert: "com" }, selection: { anchor: 8 }, userEvent: "input.type" }).state;
  assert.deepEqual(s.field(suggestionField), { pos: 8, text: "pute(1)" });
  // Typing something else drops it.
  s = s.update({ changes: { from: 8, insert: "x" }, selection: { anchor: 9 }, userEvent: "input.type" }).state;
  assert.equal(s.field(suggestionField), null);
});

test("typing the whole suggestion, editing elsewhere or moving the cursor clears it", () => {
  let s = withSuggestion("a", "bc");
  s = s.update({ changes: { from: 1, insert: "bc" }, selection: { anchor: 3 } }).state;
  assert.equal(s.field(suggestionField), null);

  s = withSuggestion("hello ", "world");
  s = s.update({ changes: { from: 0, insert: "x" }, selection: { anchor: 7 } }).state;
  assert.equal(s.field(suggestionField), null);

  s = withSuggestion("hello ", "world");
  s = s.update({ selection: { anchor: 2 } }).state;
  assert.equal(s.field(suggestionField), null);
});

test("accepting inserts the suggestion, or just its next word", () => {
  const s = withSuggestion("x := ", "compute(1, 2)\nprint(x)");
  const all = s.update(acceptSuggestion(s)!).state;
  assert.equal(all.doc.toString(), "x := compute(1, 2)\nprint(x)");
  assert.equal(all.selection.main.head, all.doc.length);
  assert.equal(all.field(suggestionField), null);

  const word = s.update(acceptSuggestion(s, nextWordLength("compute(1, 2)"))!).state;
  assert.equal(word.doc.toString(), "x := compute");
  assert.deepEqual(word.field(suggestionField), { pos: 12, text: "(1, 2)\nprint(x)" });
  assert.equal(acceptSuggestion(at("x")), null);
});

test("nextWordLength steps over words, then punctuation", () => {
  assert.equal(nextWordLength("compute(1)"), 7);
  assert.equal(nextWordLength("(1)"), 1);
  assert.equal(nextWordLength("  return 0"), 8);
  assert.equal(nextWordLength("\n    x"), 6);
});

test("automatic suggestions skip words, comments, strings and selections", () => {
  assert.equal(wantsSuggestion(at("x := ")), true);
  assert.equal(wantsSuggestion(at("fn main() int {\n    ")), true);
  assert.equal(wantsSuggestion(at("print", 2)), false, "mid-word");
  assert.equal(wantsSuggestion(at("x := 1 // note ")), false, "comment");
  assert.equal(wantsSuggestion(at('print("hel')), false, "string");
  assert.equal(wantsSuggestion(at('print("a // b") ')), true, "slashes inside a closed string");
  assert.equal(wantsSuggestion(at('print("sum {')), true, "interpolation");
  const sel = EditorState.create({ doc: "abc", selection: EditorSelection.range(0, 2) });
  assert.equal(wantsSuggestion(sel), false);
});

test("the request carries the text around the cursor and related modules", () => {
  const req = requestAt(at("fn main() int {\n  \n}", 18), "src/app.bit", [{ path: "src/geo.bit", content: "fn area() int" }]);
  assert.deepEqual(req, {
    before: "fn main() int {\n  ",
    after: "\n}",
    file: "src/app.bit",
    related: [{ path: "src/geo.bit", content: "fn area() int" }],
  });
  assert.equal(requestAt(at("x"), "main.bit", []).related, undefined);
});
