#!/usr/bin/env node
// Local development: the compile API and the Vite dev server together.
//
//   npm run dev:all                      UI on http://localhost:5180, API on :8787
//   UI_PORT=3000 API_PORT=9999 npm run dev:all
//
// Programs run as your user without a sandbox (development only). Email
// sign-in links are shown in the sign-in dialog instead of being emailed;
// REQUIRE_SIGNIN_TO_RUN=0 turns sign-in off. Ctrl+C stops both servers.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_PORT = Number(process.env.API_PORT || 8787);
const UI_PORT = Number(process.env.UI_PORT || 5180);
const color = process.stdout.isTTY ? (c, s) => `\x1b[${c}m${s}\x1b[0m` : (_c, s) => s;

function portFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "127.0.0.1");
  });
}

const bin = process.env.BITON_BIN || "biton";
const version = spawnSync(bin, ["--version"], { encoding: "utf8" });
if (version.status !== 0) {
  console.error(`Cannot run the biton compiler (${bin}). Install it with ../biton/install.sh, or set BITON_BIN.`);
  process.exit(1);
}
for (const [name, port] of [["API_PORT", API_PORT], ["UI_PORT", UI_PORT]]) {
  if (!(await portFree(port))) {
    console.error(`Port ${port} is in use. Pick another one, e.g. ${name}=${port + 1} npm run dev:all`);
    process.exit(1);
  }
}

const jobRoot = path.join(tmpdir(), `biton-dev-jobs-${API_PORT}`);
mkdirSync(jobRoot, { recursive: true });

const children = [];
function start(name, tint, cmd, args, env) {
  const child = spawn(cmd, args, { cwd: root, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = color(tint, name.padEnd(4)) + " │ ";
  for (const stream of [child.stdout, child.stderr]) {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop();
      for (const l of lines) process.stdout.write(prefix + l + "\n");
    });
  }
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(`${prefix}exited (${signal ?? code}); stopping`);
      stop(1);
    }
  });
  children.push(child);
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 500).unref();
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));

start("api", "36", process.execPath, ["server/index.ts"], {
  PORT: String(API_PORT),
  HOST: "127.0.0.1",
  JOB_ROOT: jobRoot,
  NODE_ENV: "development",
});
start("ui", "35", process.execPath, ["node_modules/vite/bin/vite.js", "--port", String(UI_PORT), "--strictPort"], {
  BITON_API_TARGET: `http://127.0.0.1:${API_PORT}`,
});

setTimeout(() => {
  console.log(
    "\n" +
      color("1", `  Biton Web Compiler → http://localhost:${UI_PORT}`) +
      `\n  compiler: ${version.stdout.trim()}` +
      `\n  sign-in: email links appear in the sign-in dialog (REQUIRE_SIGNIN_TO_RUN=0 to skip)` +
      `\n  Ctrl+C stops both servers\n`,
  );
}, 1500);
