import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { crc32, unzip, zip, ZipError } from "./zip.ts";

const text = (b: Uint8Array) => new TextDecoder().decode(b);

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("zip and unzip round-trip folders, nested files and UTF-8", async () => {
  const files = { "src/": "", "src/geo.bit": "fn area() int { return 1 }\n", "main.bit": "// héllo ✓\n".repeat(100) };
  const blob = await zip(files);
  const { entries, skipped } = await unzip(new Uint8Array(await blob.arrayBuffer()));
  assert.deepEqual(skipped, []);
  assert.deepEqual(
    entries.map((e) => [e.name, e.isDir, text(e.data)]),
    Object.entries(files).map(([n, t]) => [n, n.endsWith("/"), t]),
  );
});

test("unzip skips entries over the size limit and rejects non-zips", async () => {
  const blob = await zip({ "big.txt": "x".repeat(5000), "small.bit": "s" });
  const { entries, skipped } = await unzip(new Uint8Array(await blob.arrayBuffer()), 1000);
  assert.deepEqual(skipped, ["big.txt"]);
  assert.deepEqual(entries.map((e) => e.name), ["small.bit"]);
  await assert.rejects(unzip(new TextEncoder().encode("not a zip at all, just some text")), ZipError);
});

test("archives open with the system unzip tool and vice versa", async (t) => {
  if (spawnSync("unzip", ["-v"]).status !== 0 || spawnSync("zip", ["-v"]).status !== 0) return t.skip("zip/unzip not installed");
  const dir = await mkdtemp(path.join(tmpdir(), "zip-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  await writeFile(path.join(dir, "ours.zip"), new Uint8Array(await (await zip({ "a/": "", "a/b.bit": "hello" })).arrayBuffer()));
  const listed = spawnSync("unzip", ["-p", path.join(dir, "ours.zip"), "a/b.bit"], { encoding: "utf8" });
  assert.equal(listed.status, 0, listed.stderr);
  assert.equal(listed.stdout, "hello");

  await writeFile(path.join(dir, "x.bit"), "from zip\n".repeat(50));
  assert.equal(spawnSync("zip", ["-q", "theirs.zip", "x.bit"], { cwd: dir }).status, 0);
  const { entries } = await unzip(new Uint8Array(await readFile(path.join(dir, "theirs.zip"))));
  assert.equal(text(entries[0].data), "from zip\n".repeat(50));
});
