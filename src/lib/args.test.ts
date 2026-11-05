import { test } from "node:test";
import assert from "node:assert/strict";

import { formatArgs, parseArgs } from "./args.ts";

test("splits like a shell", () => {
  assert.deepEqual(parseArgs(""), []);
  assert.deepEqual(parseArgs("   "), []);
  assert.deepEqual(parseArgs(" a  b\tc "), ["a", "b", "c"]);
  assert.deepEqual(parseArgs(`one "two words" 'three  four'`), ["one", "two words", "three  four"]);
  assert.deepEqual(parseArgs(`"" ''`), ["", ""]);
  assert.deepEqual(parseArgs(`a\\ b "q\\"x" 'it\\s'`), ["a b", 'q"x', "it\\s"]);
  assert.deepEqual(parseArgs(`pre"mid"post`), ["premidpost"]);
  assert.deepEqual(parseArgs(`"unclosed`), ["unclosed"]);
});

test("formatArgs round-trips", () => {
  for (const args of [[], ["a"], ["two words", ""], ["it's", 'say "hi"', "a\\b", "--flag=1", "ü"]]) {
    assert.deepEqual(parseArgs(formatArgs(args)), args);
  }
  assert.equal(formatArgs(["one", "two words"]), "one 'two words'");
});
