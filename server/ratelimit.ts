// Per-client rate limiting for the public API.
//
// * Token buckets: one budget for program runs (each starts a compiler and
//   a native process) and a larger one for checks and --emit (the live
//   type-check fires while the user types). Cache hits are free.
// * A cap on concurrent jobs per client, so one client cannot occupy every
//   worker slot.
// * Clients are identified by IP address (IPv6 by /64, since one host
//   usually owns a whole /64). Behind a reverse proxy set TRUST_PROXY to
//   the number of proxies so the address comes from X-Forwarded-For.
//
// State is in memory, per API instance. With several API replicas, limit
// at the load balancer as well (or move the store to Redis).

import type { IncomingMessage } from "node:http";
import net from "node:net";

export type Bucket = "run" | "light";

export interface RateLimitConfig {
  enabled: boolean;
  /** Tokens added per minute and bucket capacity, per bucket. */
  run: { perMinute: number; burst: number };
  light: { perMinute: number; burst: number };
  maxInFlight: number;
  /** Number of reverse proxies in front of the API whose X-Forwarded-For is trusted. */
  trustProxy: number;
  /** Upper bound on tracked clients (memory guard). */
  maxClients: number;
}

export interface Decision {
  allowed: boolean;
  /** Seconds until a request would be allowed (0 when allowed). */
  retryAfter: number;
  limit: number;
  remaining: number;
  /** Seconds until the bucket is full again. */
  reset: number;
  reason?: "rate" | "concurrency";
}

interface ClientState {
  tokens: Record<Bucket, number>;
  updated: number; // ms
  inFlight: number;
}

export class RateLimiter {
  private clients = new Map<string, ClientState>();
  private cfg: RateLimitConfig;
  private now: () => number;

  constructor(cfg: RateLimitConfig, now: () => number = Date.now) {
    this.cfg = cfg;
    this.now = now;
  }

  get size() {
    return this.clients.size;
  }

  private state(key: string): ClientState {
    const t = this.now();
    let s = this.clients.get(key);
    if (!s) {
      s = { tokens: { run: this.cfg.run.burst, light: this.cfg.light.burst }, updated: t, inFlight: 0 };
      if (this.clients.size >= this.cfg.maxClients) this.evict();
      this.clients.set(key, s);
      return s;
    }
    // Refill both buckets for the time that passed.
    const elapsedMin = (t - s.updated) / 60000;
    for (const b of ["run", "light"] as const) {
      s.tokens[b] = Math.min(this.cfg[b].burst, s.tokens[b] + elapsedMin * this.cfg[b].perMinute);
    }
    s.updated = t;
    // Keep recently active clients at the end of the Map (LRU order).
    this.clients.delete(key);
    this.clients.set(key, s);
    return s;
  }

  /** Drop idle clients first, then the least recently seen. */
  private evict() {
    for (const [k, s] of this.clients) {
      if (s.inFlight === 0) {
        this.clients.delete(k);
        return;
      }
    }
    const first = this.clients.keys().next().value;
    if (first !== undefined) this.clients.delete(first);
  }

  private decision(s: ClientState, bucket: Bucket, allowed: boolean, reason?: Decision["reason"]): Decision {
    const { perMinute, burst } = this.cfg[bucket];
    const tokens = s.tokens[bucket];
    const secsPerToken = 60 / perMinute;
    return {
      allowed,
      retryAfter: allowed ? 0 : reason === "concurrency" ? 1 : Math.max(1, Math.ceil((1 - tokens) * secsPerToken)),
      limit: burst,
      remaining: Math.max(0, Math.floor(tokens)),
      reset: Math.ceil((burst - tokens) * secsPerToken),
      reason,
    };
  }

  /**
   * Take one token from `bucket` and reserve an in-flight slot. When allowed,
   * the caller must call `release(key)` once the job finishes.
   */
  acquire(key: string, bucket: Bucket): Decision {
    const s = this.state(key);
    if (!this.cfg.enabled) {
      s.inFlight++;
      return this.decision(s, bucket, true);
    }
    if (s.inFlight >= this.cfg.maxInFlight) return this.decision(s, bucket, false, "concurrency");
    if (s.tokens[bucket] < 1) return this.decision(s, bucket, false, "rate");
    s.tokens[bucket] -= 1;
    s.inFlight++;
    return this.decision(s, bucket, true);
  }

  release(key: string) {
    const s = this.clients.get(key);
    if (s && s.inFlight > 0) s.inFlight--;
  }

  /** Forget clients whose buckets are full and who have nothing running. */
  sweep() {
    for (const [k] of this.clients) {
      const s = this.state(k);
      if (s.inFlight === 0 && s.tokens.run >= this.cfg.run.burst && s.tokens.light >= this.cfg.light.burst) {
        this.clients.delete(k);
      }
    }
  }
}

/** Normalise an address to the unit we limit on: IPv4 address or IPv6 /64. */
export function addressKey(addr: string): string {
  let a = addr.trim();
  if (a.startsWith("::ffff:") && net.isIPv4(a.slice(7))) a = a.slice(7);
  if (net.isIPv6(a)) {
    const parts = expandIPv6(a);
    return parts ? `${parts.slice(0, 4).join(":")}::/64` : a;
  }
  return a;
}

function expandIPv6(a: string): string[] | null {
  const [head, tail] = a.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail !== "" ? tail.split(":") : [];
  if (a.includes("::")) {
    const missing = 8 - h.length - t.length;
    if (missing < 0) return null;
    return [...h, ...Array(missing).fill("0"), ...t].map((p) => p.toLowerCase().replace(/^0+(?=.)/, ""));
  }
  return h.length === 8 ? h.map((p) => p.toLowerCase().replace(/^0+(?=.)/, "")) : null;
}

/**
 * The client's address. With `trustProxy` = N, the N-th address from the
 * right of X-Forwarded-For (each trusted proxy appends the address it saw);
 * spoofed entries a client adds on the left are ignored.
 */
export function clientAddress(req: IncomingMessage, trustProxy: number): string {
  const socketAddr = req.socket.remoteAddress ?? "unknown";
  if (trustProxy <= 0) return socketAddr;
  const header = req.headers["x-forwarded-for"];
  const chain = (Array.isArray(header) ? header.join(",") : header ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const candidate = chain[chain.length - trustProxy];
  return candidate && net.isIP(candidate) ? candidate : socketAddr;
}

export function rateLimitHeaders(d: Decision): Record<string, string> {
  const h: Record<string, string> = {
    "RateLimit-Limit": String(d.limit),
    "RateLimit-Remaining": String(d.remaining),
    "RateLimit-Reset": String(d.reset),
  };
  if (!d.allowed) h["Retry-After"] = String(d.retryAfter);
  return h;
}
