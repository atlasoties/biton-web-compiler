import { test } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";

import { RateLimiter, addressKey, clientAddress, type RateLimitConfig } from "./ratelimit.ts";

const cfg = (over: Partial<RateLimitConfig> = {}): RateLimitConfig => ({
  enabled: true,
  run: { perMinute: 6, burst: 3 },
  light: { perMinute: 60, burst: 5 },
  maxInFlight: 10,
  trustProxy: 0,
  maxClients: 1000,
  ...over,
});

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

test("burst, then refusal with Retry-After, then refill", () => {
  const c = clock();
  const rl = new RateLimiter(cfg(), c.now);
  for (let i = 0; i < 3; i++) {
    assert.equal(rl.acquire("a", "run").allowed, true);
    rl.release("a");
  }
  const d = rl.acquire("a", "run");
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "rate");
  assert.equal(d.retryAfter, 10); // 6/min -> one token every 10 s
  c.advance(10_000);
  assert.equal(rl.acquire("a", "run").allowed, true);
});

test("buckets and clients are independent", () => {
  const rl = new RateLimiter(cfg(), clock().now);
  for (let i = 0; i < 3; i++) {
    rl.acquire("a", "run");
    rl.release("a");
  }
  assert.equal(rl.acquire("a", "run").allowed, false);
  assert.equal(rl.acquire("a", "light").allowed, true); // other bucket
  rl.release("a");
  assert.equal(rl.acquire("b", "run").allowed, true); // other client
});

test("concurrency cap per client", () => {
  const rl = new RateLimiter(cfg({ maxInFlight: 2, light: { perMinute: 600, burst: 100 } }), clock().now);
  assert.equal(rl.acquire("a", "light").allowed, true);
  assert.equal(rl.acquire("a", "light").allowed, true);
  const d = rl.acquire("a", "light");
  assert.equal(d.allowed, false);
  assert.equal(d.reason, "concurrency");
  rl.release("a");
  assert.equal(rl.acquire("a", "light").allowed, true);
});

test("refused requests do not consume tokens", () => {
  const c = clock();
  const rl = new RateLimiter(cfg({ maxInFlight: 1 }), c.now);
  assert.equal(rl.acquire("a", "run").allowed, true); // 2 tokens left, in flight
  for (let i = 0; i < 5; i++) assert.equal(rl.acquire("a", "run").reason, "concurrency");
  rl.release("a");
  assert.equal(rl.acquire("a", "run").remaining, 1);
});

test("disabled limiter allows everything", () => {
  const rl = new RateLimiter(cfg({ enabled: false }), clock().now);
  for (let i = 0; i < 50; i++) assert.equal(rl.acquire("a", "run").allowed, true);
});

test("memory guard evicts idle clients", () => {
  const rl = new RateLimiter(cfg({ maxClients: 3 }), clock().now);
  for (const k of ["a", "b", "c", "d", "e"]) {
    rl.acquire(k, "light");
    rl.release(k);
  }
  assert.ok(rl.size <= 3);
});

test("sweep forgets clients with full buckets", () => {
  const c = clock();
  const rl = new RateLimiter(cfg(), c.now);
  rl.acquire("a", "run");
  rl.release("a");
  c.advance(60_000);
  rl.sweep();
  assert.equal(rl.size, 0);
});

test("address keys: IPv4, mapped IPv4, IPv6 /64", () => {
  assert.equal(addressKey("203.0.113.7"), "203.0.113.7");
  assert.equal(addressKey("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(addressKey("2001:db8:1:2:aaaa::1"), addressKey("2001:db8:1:2:bbbb:cccc:dddd:eeee"));
  assert.notEqual(addressKey("2001:db8:1:2::1"), addressKey("2001:db8:1:3::1"));
  assert.equal(addressKey("2001:0db8:0001:0002::1"), "2001:db8:1:2::/64");
});

test("client address honours only trusted proxies", () => {
  const req = (xff: string | undefined, remote = "10.0.0.2") =>
    ({ socket: { remoteAddress: remote }, headers: xff ? { "x-forwarded-for": xff } : {} }) as unknown as IncomingMessage;
  // No trusted proxy: the header is ignored.
  assert.equal(clientAddress(req("1.2.3.4"), 0), "10.0.0.2");
  // One proxy: the last entry is what it saw; a spoofed left entry is ignored.
  assert.equal(clientAddress(req("6.6.6.6, 198.51.100.9"), 1), "198.51.100.9");
  // Two proxies (CDN + load balancer).
  assert.equal(clientAddress(req("6.6.6.6, 198.51.100.9, 172.16.0.5"), 2), "198.51.100.9");
  // Missing or garbage header falls back to the socket.
  assert.equal(clientAddress(req(undefined), 1), "10.0.0.2");
  assert.equal(clientAddress(req("not-an-ip"), 1), "10.0.0.2");
});
