import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createAuth, googleClaims, normalizeEmail, parseCookies, safeReturnPath, signToken, verifyToken, type AuthOptions } from "./auth.ts";

const SECRET = "test-secret-0123456789abcdef0123456789";
const CLIENT_ID = "client-123.apps.googleusercontent.com";

const fakeJwt = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

test("signed tokens", () => {
  const now = 1_000_000_000_000;
  const t = signToken(SECRET, "session", { email: "a@b.co", exp: now / 1000 + 60 });
  assert.equal(verifyToken<{ email: string; exp: number }>(SECRET, "session", t, now)?.email, "a@b.co");
  assert.equal(verifyToken(SECRET, "magic", t, now), null, "another purpose");
  assert.equal(verifyToken("x".repeat(40), "session", t, now), null, "another key");
  assert.equal(verifyToken(SECRET, "session", t, now + 61_000), null, "expired");
  const [body, mac] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ email: "evil@b.co", exp: now / 1000 + 60 })).toString("base64url");
  assert.equal(verifyToken(SECRET, "session", `${forged}.${mac}`, now), null, "tampered");
  assert.equal(verifyToken(SECRET, "session", body, now), null);
  assert.equal(verifyToken(SECRET, "session", "", now), null);
});

test("helpers", () => {
  assert.deepEqual(parseCookies("a=1; b=x%20y; a=2; junk; c=%E0"), { a: "1", b: "x y" });
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil", "/a\nb", 3, undefined]) assert.equal(safeReturnPath(bad), "/");
  assert.equal(safeReturnPath("/?x=1"), "/?x=1");
  assert.equal(normalizeEmail("  Ada@Example.COM "), "ada@example.com");
  for (const bad of ["", "a", "a@b", "a b@c.de", "@c.de", 5]) assert.equal(normalizeEmail(bad), null);
});

test("Google ID token claims", () => {
  const now = Date.now();
  const good = { iss: "https://accounts.google.com", aud: CLIENT_ID, exp: now / 1000 + 300, nonce: "n1", email: "Ada@Gmail.com", email_verified: true, name: "Ada" };
  assert.deepEqual(googleClaims(fakeJwt(good), CLIENT_ID, "n1", now), { email: "ada@gmail.com", name: "Ada", emailVerified: true });
  assert.equal(googleClaims(fakeJwt({ ...good, iss: "https://evil.com" }), CLIENT_ID, "n1", now), null);
  assert.equal(googleClaims(fakeJwt({ ...good, aud: "other" }), CLIENT_ID, "n1", now), null);
  assert.equal(googleClaims(fakeJwt({ ...good, aud: [CLIENT_ID, "other"], azp: "other" }), CLIENT_ID, "n1", now), null);
  assert.equal(googleClaims(fakeJwt({ ...good, exp: now / 1000 - 1 }), CLIENT_ID, "n1", now), null);
  assert.equal(googleClaims(fakeJwt({ ...good, nonce: "n2" }), CLIENT_ID, "n1", now), null);
  assert.equal(googleClaims(fakeJwt({ ...good, email_verified: false }), CLIENT_ID, "n1", now)?.emailVerified, false);
  assert.equal(googleClaims("not-a-jwt", CLIENT_ID, "n1", now), null);
});

// ── HTTP flows ──────────────────────────────────────────────────────────

interface Harness {
  base: string;
  mails: Array<{ to: string; text: string }>;
  google: { idToken: (nonce: string) => string; calls: URLSearchParams[] };
  server: Server;
}

async function start(overrides: Partial<AuthOptions> = {}): Promise<Harness> {
  const mails: Harness["mails"] = [];
  const google: Harness["google"] = { idToken: () => "", calls: [] };
  let base = "";
  const auth = createAuth({
    secret: SECRET,
    publicUrl: "",
    requireForRun: true,
    sessionDays: 1,
    secureCookies: false,
    google: { clientId: CLIENT_ID, clientSecret: "shh" },
    mailer: { describe: "test", send: async (m) => void mails.push(m) },
    clientKey: () => "127.0.0.1",
    fetch: (async (_url: string, init: RequestInit) => {
      const params = new URLSearchParams(init.body as string);
      google.calls.push(params);
      return new Response(JSON.stringify({ id_token: google.idToken(lastNonce) }), { status: 200 });
    }) as typeof fetch,
    ...overrides,
  });
  let lastNonce = "";
  const server = createServer(async (req, res) => {
    const url = new URL(req.url!, "http://x");
    if (url.pathname === "/api/auth/google") {
      // Remember the nonce the app sends Google, as Google would.
      const orig = res.writeHead.bind(res);
      res.writeHead = ((status: number, headers: Record<string, string>) => {
        if (headers?.Location) lastNonce = new URL(headers.Location).searchParams.get("nonce") ?? "";
        return orig(status, headers);
      }) as typeof res.writeHead;
    }
    if (!(await auth.handle(req, res, url))) res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, mails, google, server };
}

const post = (h: Harness, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(h.base + path, { method: "POST", headers: { "Content-Type": "application/json", Origin: h.base, ...headers }, body: JSON.stringify(body) });

const sessionCookie = (r: Response) => /biton_session=([^;]*)/.exec(r.headers.get("set-cookie") ?? "")?.[1];

test("email magic link flow", async () => {
  const h = await start();
  try {
    let s = await (await fetch(h.base + "/api/auth/session")).json();
    assert.deepEqual(s, { user: null, providers: { google: true, email: true }, requireForRun: true });

    assert.equal((await post(h, "/api/auth/email", { email: "nope" })).status, 400);
    assert.equal((await post(h, "/api/auth/email", { email: "ada@example.com" }, { Origin: "https://evil.com" })).status, 403);
    const sent = await post(h, "/api/auth/email", { email: "Ada@Example.com" });
    assert.equal(sent.status, 200);
    assert.deepEqual(await sent.json(), { ok: true }, "a real mailer never reveals the link");
    assert.equal(h.mails.length, 1);
    assert.equal(h.mails[0].to, "ada@example.com");
    const token = /#login=([A-Za-z0-9_.-]+)/.exec(h.mails[0].text)![1];
    assert.ok(h.mails[0].text.includes(`${h.base}/#login=`), "the link points at the app");

    const v = await post(h, "/api/auth/email/verify", { token });
    assert.equal(v.status, 200);
    assert.equal((await v.json()).user.email, "ada@example.com");
    const cookie = sessionCookie(v)!;
    assert.ok(cookie);
    assert.match(v.headers.get("set-cookie")!, /HttpOnly; SameSite=Lax/);

    s = await (await fetch(h.base + "/api/auth/session", { headers: { Cookie: `biton_session=${cookie}` } })).json();
    assert.equal(s.user.email, "ada@example.com");
    assert.equal(s.user.provider, "email");

    assert.equal((await post(h, "/api/auth/email/verify", { token })).status, 400, "a link works once");
    assert.equal((await post(h, "/api/auth/email/verify", { token: token + "x" })).status, 400);

    const out = await post(h, "/api/auth/logout", {}, { Cookie: `biton_session=${cookie}` });
    assert.match(out.headers.get("set-cookie")!, /biton_session=; .*Max-Age=0/);
  } finally {
    h.server.close();
  }
});

test("the development mailer shows the link", async () => {
  const h = await start({ mailer: { describe: "dev", showLinks: true, send: async () => {} } });
  try {
    const body = await (await post(h, "/api/auth/email", { email: "dev@example.com" })).json();
    assert.match(body.devLink, new RegExp(`^${h.base}/#login=`));
  } finally {
    h.server.close();
  }
});

test("sign-in emails are throttled", async () => {
  const h = await start({ emailsPerAddressPerHour: 2, emailsPerIpPerHour: 3 });
  try {
    const statuses = [];
    for (const to of ["a@x.io", "a@x.io", "a@x.io", "b@x.io", "c@x.io"]) statuses.push((await post(h, "/api/auth/email", { email: to })).status);
    assert.deepEqual(statuses, [200, 200, 429, 200, 429]);
    assert.equal(h.mails.length, 3);
  } finally {
    h.server.close();
  }
});

test("Google flow", async () => {
  const h = await start();
  try {
    const go = await fetch(h.base + "/api/auth/google?return=/?x=1", { redirect: "manual" });
    assert.equal(go.status, 302);
    const to = new URL(go.headers.get("location")!);
    assert.equal(to.origin + to.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.equal(to.searchParams.get("client_id"), CLIENT_ID);
    assert.equal(to.searchParams.get("redirect_uri"), `${h.base}/api/auth/google/callback`);
    assert.equal(to.searchParams.get("code_challenge_method"), "S256");
    const oauth = /biton_oauth=([^;]*)/.exec(go.headers.get("set-cookie")!)![1];
    const state = to.searchParams.get("state")!;
    const cookie = { Cookie: `biton_oauth=${oauth}` };

    h.google.idToken = (nonce) =>
      fakeJwt({ iss: "accounts.google.com", aud: CLIENT_ID, exp: Date.now() / 1000 + 300, nonce, email: "grace@gmail.com", email_verified: true, name: "Grace" });

    // A wrong state (a forged callback) is refused before Google is asked.
    const forged = await fetch(`${h.base}/api/auth/google/callback?code=c&state=wrong`, { redirect: "manual", headers: cookie });
    assert.equal(forged.headers.get("location"), "/#auth-error=expired");
    assert.equal(h.google.calls.length, 0);

    const back = await fetch(`${h.base}/api/auth/google/callback?code=the-code&state=${state}`, { redirect: "manual", headers: cookie });
    assert.equal(back.status, 302);
    assert.equal(back.headers.get("location"), "/?x=1");
    assert.equal(h.google.calls[0].get("code"), "the-code");
    assert.equal(h.google.calls[0].get("client_secret"), "shh");
    assert.ok(h.google.calls[0].get("code_verifier"));
    const session = sessionCookie(back)!;
    const s = await (await fetch(h.base + "/api/auth/session", { headers: { Cookie: `biton_session=${session}` } })).json();
    assert.deepEqual([s.user.email, s.user.name, s.user.provider], ["grace@gmail.com", "Grace", "google"]);

    h.google.idToken = (nonce) =>
      fakeJwt({ iss: "accounts.google.com", aud: CLIENT_ID, exp: Date.now() / 1000 + 300, nonce, email: "x@gmail.com", email_verified: false });
    const unverified = await fetch(`${h.base}/api/auth/google/callback?code=c&state=${state}`, { redirect: "manual", headers: cookie });
    assert.equal(unverified.headers.get("location"), "/#auth-error=unverified");
    assert.equal(sessionCookie(unverified), undefined, "no session");

    const cancelled = await fetch(`${h.base}/api/auth/google/callback?error=access_denied`, { redirect: "manual", headers: cookie });
    assert.equal(cancelled.headers.get("location"), "/#auth-error=cancelled");
  } finally {
    h.server.close();
  }
});

test("providers that are not configured are not served", async () => {
  const h = await start({ google: undefined, mailer: undefined, requireForRun: false });
  try {
    assert.equal((await fetch(h.base + "/api/auth/google", { redirect: "manual" })).status, 404);
    assert.equal((await post(h, "/api/auth/email", { email: "a@b.co" })).status, 404);
    const s = await (await fetch(h.base + "/api/auth/session")).json();
    assert.deepEqual(s.providers, { google: false, email: false });
  } finally {
    h.server.close();
  }
});
