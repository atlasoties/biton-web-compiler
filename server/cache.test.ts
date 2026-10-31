import { test } from "node:test";
import assert from "node:assert/strict";

import { ResultCache } from "./cache.ts";
import type { CompileResponse } from "../shared/api.ts";

const res = (n: number): CompileResponse => ({
  success: true, mode: "check", failedAt: null, diagnostics: [], compilerOutput: "x".repeat(n), compileTimeMs: 1,
});

test("only checks and emits are cacheable", () => {
  assert.equal(ResultCache.cacheable({ code: "", mode: "check" }), true);
  assert.equal(ResultCache.cacheable({ code: "", mode: "emit", emit: "ir" }), true);
  assert.equal(ResultCache.cacheable({ code: "", mode: "run" }), false);
});

test("key depends on compiler version, mode, emit kind and opt for ir", () => {
  const k = (v: string, r: Parameters<typeof ResultCache.key>[1]) => ResultCache.key(v, r);
  const base = { code: "a", mode: "emit" as const, emit: "ir" as const, opt: "O2" as const };
  assert.notEqual(k("1", base), k("2", base));
  assert.notEqual(k("1", base), k("1", { ...base, opt: "O0" }));
  assert.notEqual(k("1", base), k("1", { ...base, emit: "mir" }));
  // opt does not affect checks
  assert.equal(k("1", { code: "a", mode: "check", opt: "O0" }), k("1", { code: "a", mode: "check", opt: "O3" }));
});

test("evicts least recently used entries past the size limit", () => {
  const c = new ResultCache(9000); // entries of ~2.2 KB; at most a quarter of the cache each
  for (const k of ["a", "b", "c", "d"]) c.set(k, res(1000));
  assert.ok(c.get("a")); // a becomes most recent, b is now least recent
  c.set("e", res(1000)); // over budget: evicts b
  assert.equal(c.get("b"), undefined);
  for (const k of ["a", "c", "d", "e"]) assert.ok(c.get(k), k);
  assert.ok(c.stats().bytes <= 9000);
});

test("refuses entries larger than a quarter of the cache", () => {
  const c = new ResultCache(9000);
  c.set("big", res(3000));
  assert.equal(c.get("big"), undefined);
});
