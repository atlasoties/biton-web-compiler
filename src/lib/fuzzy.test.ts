import { test } from "node:test";
import assert from "node:assert/strict";

import { fuzzyFilter, fuzzyMatch } from "./fuzzy.ts";

test("matches characters in order, case-insensitively", () => {
  assert.ok(fuzzyMatch("geo", "src/util/geo.bit"));
  assert.ok(fuzzyMatch("sug", "src/util/geo.bit"));
  assert.ok(fuzzyMatch("GEO", "src/util/geo.bit"));
  assert.equal(fuzzyMatch("oeg", "geo.bit"), null);
  assert.deepEqual(fuzzyMatch("", "x")!.indices, []);
});

test("file-name and prefix matches rank first", () => {
  const paths = ["src/geography/x.bit", "src/util/geo.bit", "lib/genome.bit", "main.bit"];
  assert.deepEqual(
    fuzzyFilter("geo", paths).map((m) => m.path),
    ["src/util/geo.bit", "lib/genome.bit", "src/geography/x.bit"],
  );
  assert.equal(fuzzyFilter("main", paths)[0].path, "main.bit");
  assert.equal(fuzzyFilter("ma", ["src/format.bit", "main.bit"])[0].path, "main.bit");
});

test("highlight indices point at the matched characters", () => {
  const m = fuzzyMatch("gb", "src/geo.bit")!;
  assert.deepEqual(m.indices.map((i) => "src/geo.bit"[i]), ["g", "b"]);
});
