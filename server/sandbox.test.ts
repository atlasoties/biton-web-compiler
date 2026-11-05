import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// The job root is read when config.ts loads, so set it before importing.
const root = await mkdtemp(path.join(tmpdir(), "biton-sandbox-test-"));
process.env.JOB_ROOT = root;
process.env.BITON_SANDBOX = "none";
const { createJob, destroyJob } = await import("./sandbox.ts");
after(() => rm(root, { recursive: true, force: true }));

test("a job writes nested project files and cleans them up", async () => {
  const job = await createJob(0, { "main.bit": "m", "src/util/geo.bit": "g", "src/app.bit": "a" });
  assert.equal(await readFile(path.join(job.dir, "src/util/geo.bit"), "utf8"), "g");
  assert.equal(await readFile(path.join(job.dir, "src/app.bit"), "utf8"), "a");
  await destroyJob(job);
  await assert.rejects(readFile(path.join(job.dir, "main.bit")));
});

test("a job refuses to write outside its directory", async () => {
  await assert.rejects(createJob(1, { "ok.bit": "", "../escape.bit": "x" }), /outside the job/);
  assert.deepEqual(await readdir(root), [], "a failed job leaves nothing behind");
});
