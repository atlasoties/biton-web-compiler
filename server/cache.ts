// In-memory LRU cache for deterministic results (type checks and --emit
// output), bounded by approximate size in bytes. Program runs are never
// cached: a program may read the clock, its input or the environment.

import { createHash } from "node:crypto";

import type { CompileRequest, CompileResponse } from "../shared/api.ts";

export class ResultCache {
  private map = new Map<string, { value: CompileResponse; bytes: number }>();
  private bytes = 0;
  hits = 0;
  misses = 0;

  private maxBytes: number;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
  }

  static cacheable(req: CompileRequest): boolean {
    return req.mode === "check" || req.mode === "emit";
  }

  /** The compiler version is part of the key, so an upgrade never serves stale output. */
  static key(compilerVersion: string, req: CompileRequest): string {
    const opt = req.mode === "emit" && req.emit === "ir" ? (req.opt ?? "O2") : "";
    return createHash("sha256")
      .update(JSON.stringify([compilerVersion, req.mode, req.emit ?? "", opt, req.code]))
      .digest("hex");
  }

  get(key: string): CompileResponse | undefined {
    const hit = this.map.get(key);
    if (!hit) {
      this.misses++;
      return undefined;
    }
    // Move to the most-recently-used end.
    this.map.delete(key);
    this.map.set(key, hit);
    this.hits++;
    return hit.value;
  }

  set(key: string, value: CompileResponse) {
    if (this.maxBytes === 0) return;
    const bytes = JSON.stringify(value).length * 2 + key.length;
    if (bytes > this.maxBytes / 4) return; // don't let one entry flush the cache
    const old = this.map.get(key);
    if (old) {
      this.bytes -= old.bytes;
      this.map.delete(key);
    }
    this.map.set(key, { value, bytes });
    this.bytes += bytes;
    for (const [k, v] of this.map) {
      if (this.bytes <= this.maxBytes) break;
      this.map.delete(k);
      this.bytes -= v.bytes;
    }
  }

  stats() {
    return { entries: this.map.size, bytes: this.bytes, hits: this.hits, misses: this.misses };
  }
}
