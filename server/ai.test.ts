import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { AIProviderError, cleanCompletion, complete, validateCompleteRequest, type AiProvider } from "./ai.ts";
import { BadRequest } from "./compiler.ts";

test("cleanCompletion strips fences and trailing whitespace but keeps indentation", () => {
  assert.equal(cleanCompletion("```biton\n    return 0\n```\n"), "    return 0");
  assert.equal(cleanCompletion("```\nx\n```"), "x");
  assert.equal(cleanCompletion("\n\n  x\n\n"), "  x");
  assert.equal(cleanCompletion("   "), "");
  assert.equal(cleanCompletion("print(1)"), "print(1)");
});

test("validateCompleteRequest accepts the editor request and rejects bad shapes", () => {
  const req = { before: "fn main() int {\n", after: "}\n", file: "main.bit" };
  assert.deepEqual(validateCompleteRequest(req), req);
  for (const bad of [
    null,
    3,
    "x",
    {},
    { before: 1, after: "", file: "x" },
    { before: "", after: 1, file: "x" },
    { before: "", after: "", file: 1 },
    { before: "x".repeat(32_001), after: "", file: "x" },
    { before: "", after: "x".repeat(16_001), file: "x" },
    { before: "", after: "", file: "x".repeat(513) },
  ]) {
    assert.throws(() => validateCompleteRequest(bad), BadRequest, JSON.stringify(bad).slice(0, 40));
  }
});

test("complete posts an OpenAI-compatible request and cleans the answer", async () => {
  let captured: any;
  let authorization: string | undefined;
  const server = createServer((req, res) => {
    authorization = req.headers.authorization;
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      captured = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "```biton\n    return 0\n```" } }] }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const provider: AiProvider = {
    baseUrl: `http://127.0.0.1:${port}`,
    apiKey: "test-key",
    model: "test-model",
    maxTokens: 64,
    maxBefore: 4000,
    maxAfter: 2000,
    timeoutMs: 2000,
  };

  try {
    const out = await complete(
      { before: "fn main() int {\n", after: "}\n", file: "main.bit" },
      new AbortController().signal,
      provider,
    );
    assert.equal(out, "    return 0");
    assert.equal(authorization, "Bearer test-key");
    assert.equal(captured.model, "test-model");
    assert.equal(captured.max_tokens, 64);
    assert.equal(captured.temperature, 0.1);
    assert.match(captured.messages[0].content, /Biton/);
    assert.match(captured.messages[1].content, /<file>main\.bit<\/file>/);
    assert.match(captured.messages[1].content, /<before>fn main\(\) int \{\n<\/before>/);
    assert.match(captured.messages[1].content, /<cursor\/>/);
    assert.match(captured.messages[1].content, /<after>\}\n<\/after>/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("provider failures become AIProviderError", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(429, { "Content-Type": "text/plain" });
    res.end("too many requests");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const provider: AiProvider = {
    baseUrl: `http://127.0.0.1:${port}`,
    apiKey: "",
    model: "test-model",
    maxTokens: 64,
    maxBefore: 4000,
    maxAfter: 2000,
    timeoutMs: 2000,
  };

  try {
    await assert.rejects(
      complete({ before: "", after: "", file: "main.bit" }, new AbortController().signal, provider),
      (e: unknown) => e instanceof AIProviderError && e.status === 429 && /HTTP 429/.test(e.message),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("cleanCompletion drops text already around the cursor", () => {
  // A closing bracket the editor already inserted is not doubled...
  assert.equal(cleanCompletion("x + 1)", "print(", ")"), "x + 1");
  assert.equal(cleanCompletion("1;", "x := ", ";\n"), "1");
  // ...but a balanced call keeps its own parentheses.
  assert.equal(cleanCompletion("foo()", "print(", ")"), "foo()");
  // A repeat of the current line's start is removed.
  assert.equal(cleanCompletion("    return 0", "fn main() int {\n    ", "\n}"), "return 0");
  assert.equal(cleanCompletion("x := compute()", "x := ", ""), "compute()");
  // Echoed prompt tags are removed; an answer that only repeats the rest is empty.
  assert.equal(cleanCompletion("<cursor/>return 0</after>", "", ""), "return 0");
  assert.equal(cleanCompletion("}", "  return 0\n", "}\n"), "");
});

test("validateCompleteRequest checks related files", () => {
  const base = { before: "", after: "", file: "main.bit" };
  assert.deepEqual(validateCompleteRequest({ ...base, related: [{ path: "geo.bit", content: "fn f() int" }] }).related, [
    { path: "geo.bit", content: "fn f() int" },
  ]);
  for (const related of [
    "x",
    [{ path: "../x", content: "" }],
    [{ path: "a.bit" }],
    [{ path: "a.bit", content: "x".repeat(3001) }],
    Array(5).fill({ path: "a.bit", content: "" }),
  ]) {
    assert.throws(() => validateCompleteRequest({ ...base, related }), BadRequest, JSON.stringify(related).slice(0, 40));
  }
});

test("complete sends related modules to the provider", async () => {
  let captured: any;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      captured = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "geo.area(1, 2)" } }] }));
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    const out = await complete(
      { before: "x := ", after: "", file: "main.bit", related: [{ path: "geo.bit", content: "fn area(w: int, h: int) int" }] },
      new AbortController().signal,
      { baseUrl: `http://127.0.0.1:${port}`, apiKey: "", model: "m", maxTokens: 64, maxBefore: 4000, maxAfter: 2000, timeoutMs: 2000 },
    );
    assert.equal(out, "geo.area(1, 2)");
    assert.match(captured.messages[1].content, /<related path="geo.bit">\nfn area\(w: int, h: int\) int\n<\/related>/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
