// Sign-in for the public API: Google (OpenID Connect) and email magic links.
//
// Signing in is what lets a client *run* programs (REQUIRE_SIGNIN_TO_RUN);
// checking, formatting and --emit stay open to everyone. There is no user
// database: a session is a signed cookie naming the verified email address.
//
//   GET  /api/auth/session         { user | null, providers, requireForRun }
//   GET  /api/auth/google          redirect to Google (authorization code + PKCE)
//   GET  /api/auth/google/callback Google's redirect back; sets the session
//   POST /api/auth/email           { email } -> mails a one-time link (15 min)
//   POST /api/auth/email/verify    { token } -> sets the session
//   POST /api/auth/logout
//
// The magic link points at the app (`/#login=<token>`), not at the API: the
// fragment never leaves the browser, so mail scanners that prefetch links
// cannot use up the token, and only the page's script redeems it (POST).
//
// Tokens and cookies are HMAC-SHA256 signed with AUTH_SECRET, each kind with
// its own purpose string so one can never stand in for another. Sessions are
// stateless, so signing out clears the cookie but cannot revoke a copied
// one before it expires; rotating AUTH_SECRET ends every session. Used magic
// tokens and the email throttle are kept in memory, per API instance.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

import type { AuthStatus, AuthUser } from "../shared/api.ts";

export interface Mailer {
  /** Human-readable, for the startup log. */
  describe: string;
  /**
   * Development only: also return the link in the API response, so it can be
   * shown in the sign-in dialog. Never set for a real mail server.
   */
  showLinks?: boolean;
  send(msg: { to: string; subject: string; text: string; html: string }): Promise<void>;
}

export interface AuthOptions {
  /** HMAC key, at least 32 characters. */
  secret: string;
  /**
   * Origin the app is served from (https://biton.example.com), for Google's
   * redirect URI, magic links and the Origin check. When empty (development
   * only) it is taken from each request's Host header.
   */
  publicUrl: string;
  requireForRun: boolean;
  sessionDays: number;
  google?: { clientId: string; clientSecret: string };
  /** Email sign-in is offered when a mailer is configured. */
  mailer?: Mailer;
  /** Secure cookies (and the __Host- prefix). On for https public URLs. */
  secureCookies: boolean;
  /** Sign-in emails per client address per hour. */
  emailsPerIpPerHour?: number;
  /** Sign-in emails per recipient per hour. */
  emailsPerAddressPerHour?: number;
  /** The client address of a request (proxy-aware), for the email throttle. */
  clientKey: (req: IncomingMessage) => string;
  log?: (fields: Record<string, unknown>) => void;
  fetch?: typeof fetch;
  now?: () => number;
}

export class AuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const OAUTH_TTL_S = 10 * 60;
const MAGIC_TTL_S = 15 * 60;
const MAX_JSON_BYTES = 4096;
// Deliberately simple: one @, no spaces, a dot in the domain. The mail
// server is the real judge; this only keeps junk out of the throttle.
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;

// ── signed tokens ───────────────────────────────────────────────────────

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signToken(secret: string, purpose: string, payload: object): string {
  const body = b64url(JSON.stringify(payload));
  const mac = createHmac("sha256", secret).update(`${purpose}.${body}`).digest("base64url");
  return `${body}.${mac}`;
}

/** The payload of a token signed for `purpose`, or null (bad signature, malformed, or expired). */
export function verifyToken<T extends { exp: number }>(secret: string, purpose: string, token: string, nowMs: number): T | null {
  if (typeof token !== "string" || token.length > 4096) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const mac = Buffer.from(token.slice(dot + 1), "base64url");
  const expected = createHmac("sha256", secret).update(`${purpose}.${body}`).digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= nowMs) return null;
    return payload;
  } catch {
    return null;
  }
}

// ── small helpers ───────────────────────────────────────────────────────

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) {
      try {
        out[k] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* malformed: ignore */
      }
    }
  }
  return out;
}

/** A same-site path to return to after signing in, or "/". */
export function safeReturnPath(p: unknown): string {
  if (typeof p !== "string" || p.length > 512 || !p.startsWith("/") || p.startsWith("//") || /[\\\r\n\t]/.test(p)) return "/";
  return p;
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

/** A stable, opaque id for an email address (for rate limits and logs). */
export const userId = (email: string) => "u_" + createHash("sha256").update(email).digest("hex").slice(0, 20);

/** Counts events per key in fixed one-hour windows. */
class HourlyThrottle {
  private hits = new Map<string, { count: number; reset: number }>();
  private limit: number;
  private now: () => number;
  constructor(limit: number, now: () => number) {
    this.limit = limit;
    this.now = now;
  }

  /** Seconds until `key` may have another, or 0 (nothing is counted). */
  wait(key: string): number {
    const t = this.now();
    const h = this.hits.get(key);
    if (!h || h.reset <= t || h.count < this.limit) return 0;
    return Math.ceil((h.reset - t) / 1000);
  }

  count(key: string) {
    const t = this.now();
    let h = this.hits.get(key);
    if (!h || h.reset <= t) {
      if (this.hits.size > 50_000) this.sweep(t);
      h = { count: 0, reset: t + 3600_000 };
      this.hits.set(key, h);
    }
    h.count++;
  }

  private sweep(t: number) {
    for (const [k, v] of this.hits) if (v.reset <= t) this.hits.delete(k);
  }
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_JSON_BYTES) {
        reject(new AuthError(413, "request body too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (v && typeof v === "object" && !Array.isArray(v)) resolve(v as Record<string, unknown>);
        else reject(new AuthError(400, "expected a JSON object"));
      } catch {
        reject(new AuthError(400, "body is not valid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function redirect(res: ServerResponse, location: string, cookies: string[] = []) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Set-Cookie": cookies });
  res.end();
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// ── the auth service ────────────────────────────────────────────────────

interface SessionPayload {
  email: string;
  name: string;
  provider: AuthUser["provider"];
  exp: number;
}

export interface Auth {
  /** The signed-in user of a request, if any. */
  user(req: IncomingMessage): AuthUser | null;
  /** Throws AuthError(403) for a state-changing request from another origin. */
  checkOrigin(req: IncomingMessage): void;
  /** Handle /api/auth/*; false when the path is not an auth route. */
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
  status(req: IncomingMessage): AuthStatus;
  readonly requireForRun: boolean;
  describe(): string[];
}

export function createAuth(o: AuthOptions): Auth {
  if (o.secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  const now = o.now ?? Date.now;
  const fetchFn = o.fetch ?? fetch;
  const log = o.log ?? (() => {});
  const sessionCookie = o.secureCookies ? "__Host-biton_session" : "biton_session";
  const oauthCookie = o.secureCookies ? "__Host-biton_oauth" : "biton_oauth";
  const ipThrottle = new HourlyThrottle(o.emailsPerIpPerHour ?? 10, now);
  const addressThrottle = new HourlyThrottle(o.emailsPerAddressPerHour ?? 5, now);
  /** Magic-link ids already redeemed, until they expire. */
  const usedLinks = new Map<string, number>();

  const cookie = (name: string, value: string, maxAge: number) =>
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${o.secureCookies ? "; Secure" : ""}`;

  const origin = (req: IncomingMessage): string => {
    if (o.publicUrl) return o.publicUrl;
    const host = req.headers.host ?? "localhost";
    return `http://${host}`;
  };

  const user = (req: IncomingMessage): AuthUser | null => {
    const token = parseCookies(req.headers.cookie)[sessionCookie];
    if (!token) return null;
    const s = verifyToken<SessionPayload>(o.secret, "session", token, now());
    if (!s || typeof s.email !== "string") return null;
    return { id: userId(s.email), email: s.email, name: s.name || s.email, provider: s.provider };
  };

  const startSession = (email: string, name: string, provider: AuthUser["provider"]): string => {
    const maxAge = Math.round(o.sessionDays * 86400);
    const token = signToken(o.secret, "session", { email, name, provider, exp: Math.floor(now() / 1000) + maxAge });
    log({ event: "signin", provider, user: userId(email) });
    return cookie(sessionCookie, token, maxAge);
  };

  const checkOrigin = (req: IncomingMessage) => {
    const got = req.headers.origin;
    // Browsers send Origin on every cross-origin POST (and on same-origin
    // ones in practice); a request without it is not from a web page.
    if (got !== undefined && got !== origin(req)) throw new AuthError(403, "cross-origin request refused");
  };

  const status = (req: IncomingMessage): AuthStatus => ({
    user: user(req),
    providers: { google: !!o.google, email: !!o.mailer },
    requireForRun: o.requireForRun,
  });

  // ── Google ──
  const googleStart = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const g = o.google!;
    const state = randomBytes(16).toString("base64url");
    const nonce = randomBytes(16).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const pending = signToken(o.secret, "oauth", {
      state,
      nonce,
      verifier,
      ret: safeReturnPath(url.searchParams.get("return")),
      exp: Math.floor(now() / 1000) + OAUTH_TTL_S,
    });
    const params = new URLSearchParams({
      client_id: g.clientId,
      redirect_uri: `${origin(req)}/api/auth/google/callback`,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    redirect(res, `${GOOGLE_AUTH}?${params}`, [cookie(oauthCookie, pending, OAUTH_TTL_S)]);
  };

  const googleCallback = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const clear = cookie(oauthCookie, "", 0);
    const fail = (reason: string, detail?: string) => {
      log({ event: "signin_failed", provider: "google", reason, detail });
      redirect(res, `/#auth-error=${reason}`, [clear]);
    };
    const pending = verifyToken<{ state: string; nonce: string; verifier: string; ret: string; exp: number }>(
      o.secret,
      "oauth",
      parseCookies(req.headers.cookie)[oauthCookie] ?? "",
      now(),
    );
    if (url.searchParams.get("error")) return fail("cancelled", url.searchParams.get("error")!);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!pending || !code || !state || state.length !== pending.state.length || !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))) {
      return fail("expired");
    }

    const g = o.google!;
    let idToken: string;
    try {
      const r = await fetchFn(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: g.clientId,
          client_secret: g.clientSecret,
          redirect_uri: `${origin(req)}/api/auth/google/callback`,
          grant_type: "authorization_code",
          code_verifier: pending.verifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await r.json().catch(() => ({}))) as { id_token?: string; error?: string };
      if (!r.ok || typeof body.id_token !== "string") return fail("google", body.error ?? `HTTP ${r.status}`);
      idToken = body.id_token;
    } catch (e) {
      return fail("google", (e as Error).message);
    }

    // The ID token came straight from Google's token endpoint over TLS, so
    // (OpenID Connect Core 3.1.3.7) its claims are checked, not its signature.
    const claims = googleClaims(idToken, g.clientId, pending.nonce, now());
    if (!claims) return fail("google", "invalid id token");
    if (!claims.emailVerified) return fail("unverified");
    redirect(res, pending.ret, [clear, startSession(claims.email, claims.name, "google")]);
  };

  // ── email ──
  const emailStart = async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);
    if (!email) throw new AuthError(400, "enter a valid email address");
    const ip = o.clientKey(req);
    const wait = Math.max(ipThrottle.wait(ip), addressThrottle.wait(email));
    if (wait) {
      sendJson(res, 429, { error: `too many sign-in emails; try again in ${Math.ceil(wait / 60)} min`, retryAfter: wait }, { "Retry-After": String(wait) });
      return;
    }
    const token = signToken(o.secret, "magic", {
      email,
      jti: randomBytes(12).toString("base64url"),
      exp: Math.floor(now() / 1000) + MAGIC_TTL_S,
    });
    const link = `${origin(req)}/#login=${token}`;
    // Counted before sending, so a slow mail server cannot be raced past the limit.
    ipThrottle.count(ip);
    addressThrottle.count(email);
    try {
      await o.mailer!.send({
        to: email,
        subject: "Sign in to the Biton Web Compiler",
        text:
          `Open this link to sign in to the Biton Web Compiler:\n\n${link}\n\n` +
          `It works once and expires in ${MAGIC_TTL_S / 60} minutes. If you did not ask for it, ignore this email.\n`,
        html:
          `<p>Open this link to sign in to the Biton Web Compiler:</p>` +
          `<p><a href="${escapeHtml(link)}">Sign in</a></p>` +
          `<p style="color:#666">It works once and expires in ${MAGIC_TTL_S / 60} minutes. If you did not ask for it, ignore this email.</p>`,
      });
    } catch (e) {
      log({ event: "email_failed", error: (e as Error).message });
      throw new AuthError(502, "the sign-in email could not be sent; try again later");
    }
    log({ event: "signin_email_sent", user: userId(email) });
    sendJson(res, 200, o.mailer!.showLinks ? { ok: true, devLink: link } : { ok: true });
  };

  const emailVerify = async (req: IncomingMessage, res: ServerResponse) => {
    const body = await readJsonBody(req);
    const t = now();
    const link = verifyToken<{ email: string; jti: string; exp: number }>(o.secret, "magic", body.token as string, t);
    if (!link || typeof link.jti !== "string" || usedLinks.has(link.jti)) {
      throw new AuthError(400, "this sign-in link has expired or was already used; ask for a new one");
    }
    for (const [jti, exp] of usedLinks) if (exp * 1000 <= t) usedLinks.delete(jti);
    usedLinks.set(link.jti, link.exp);
    const setCookie = startSession(link.email, link.email, "email");
    sendJson(res, 200, { user: { id: userId(link.email), email: link.email, name: link.email, provider: "email" } }, { "Set-Cookie": setCookie });
  };

  return {
    requireForRun: o.requireForRun,
    user,
    checkOrigin,
    status,
    describe() {
      const p = [o.google && "Google", o.mailer && `email (${o.mailer.describe})`].filter(Boolean).join(", ") || "none";
      return [
        `sign-in: ${p}; ${o.requireForRun ? "required to run programs" : "optional"}`,
        `  public URL: ${o.publicUrl || "(from the Host header; development only)"}`,
      ];
    },

    async handle(req, res, url) {
      if (!url.pathname.startsWith("/api/auth/")) return false;
      const route = `${req.method} ${url.pathname}`;
      try {
        switch (route) {
          case "GET /api/auth/session":
            sendJson(res, 200, status(req));
            return true;
          case "GET /api/auth/google":
            if (!o.google) break;
            googleStart(req, res, url);
            return true;
          case "GET /api/auth/google/callback":
            if (!o.google) break;
            await googleCallback(req, res, url);
            return true;
          case "POST /api/auth/email":
            if (!o.mailer) break;
            checkOrigin(req);
            await emailStart(req, res);
            return true;
          case "POST /api/auth/email/verify":
            if (!o.mailer) break;
            checkOrigin(req);
            await emailVerify(req, res);
            return true;
          case "POST /api/auth/logout":
            checkOrigin(req);
            sendJson(res, 200, { ok: true }, { "Set-Cookie": cookie(sessionCookie, "", 0) });
            return true;
        }
        sendJson(res, 404, { error: "not found" });
      } catch (e) {
        if (e instanceof AuthError) sendJson(res, e.status, { error: e.message });
        else throw e;
      }
      return true;
    },
  };
}

/** Validated claims of a Google ID token, or null. */
export function googleClaims(
  idToken: string,
  clientId: string,
  nonce: string,
  nowMs: number,
): { email: string; name: string; emailVerified: boolean } | null {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (!GOOGLE_ISSUERS.has(c.iss as string)) return null;
    if (!aud.includes(clientId)) return null;
    if (Array.isArray(c.aud) && c.aud.length > 1 && c.azp !== clientId) return null;
    if (typeof c.exp !== "number" || c.exp * 1000 <= nowMs) return null;
    if (c.nonce !== nonce) return null;
    const email = normalizeEmail(c.email);
    if (!email) return null;
    return { email, name: typeof c.name === "string" && c.name ? c.name.slice(0, 200) : email, emailVerified: c.email_verified === true };
  } catch {
    return null;
  }
}

/** The mailer the environment configures, if any. */
export async function mailerFromEnv(opts: { smtpUrl: string; from: string; production: boolean }): Promise<Mailer | undefined> {
  if (opts.smtpUrl) {
    if (!opts.from) throw new Error("SMTP_URL is set but EMAIL_FROM is not");
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(opts.smtpUrl);
    const host = (() => {
      try {
        return new URL(opts.smtpUrl).host;
      } catch {
        return "smtp";
      }
    })();
    return {
      describe: `SMTP ${host}`,
      async send(msg) {
        await transport.sendMail({ from: opts.from, ...msg });
      },
    };
  }
  if (!opts.production) {
    // Development: print the link instead of sending it.
    return {
      describe: "shown in the sign-in dialog and this log (development; set SMTP_URL to send)",
      showLinks: true,
      async send(msg) {
        const link = /https?:\/\/\S+/.exec(msg.text)?.[0];
        console.log(`\n  sign-in link for ${msg.to}:\n  ${link}\n`);
      },
    };
  }
  return undefined;
}
