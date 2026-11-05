import { useEffect, useRef, useState } from "react";
import { Loader2, Mail, X } from "lucide-react";

import { Button, IconButton, Logo } from "../ui";

import type { AuthStatus } from "../../../shared/api.ts";
import { googleSignInUrl, sendSignInEmail } from "../../lib/api";

interface SignInDialogProps {
  providers: AuthStatus["providers"];
  /** Why the dialog opened, e.g. "Sign in to run programs." */
  reason?: string;
  /** An error from a previous attempt (a failed Google sign-in, an expired link). */
  error?: string;
  onClose: () => void;
  /** Called before the browser leaves for Google, so the workspace can be saved. */
  beforeLeave: () => void;
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-4 h-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function SignInDialog({ providers, reason, error: initialError, onClose, beforeLeave }: SignInDialogProps) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    (firstFieldRef.current ?? dialogRef.current)?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
    } else if (e.key === "Tab" && dialogRef.current) {
      // Keep focus inside the dialog.
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>("a[href], button:not(:disabled), input:not(:disabled)")];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const r = await sendSignInEmail(email);
      setDevLink(r.devLink ?? null);
      setSentTo(email.trim());
    } catch (err) {
      setError((err as Error).message.replace(/ \(HTTP \d+\)$/, ""));
    } finally {
      setSending(false);
    }
  };

  const none = !providers.google && !providers.email;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-[2px] p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-[380px] bg-surface border border-line rounded-xl shadow-pop p-6 text-fg outline-none animate-pop"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <Logo className="w-10 h-10 mb-4" />
            <h2 id="signin-title" className="text-[17px] font-semibold tracking-tight text-fg">
              Sign in to Biton
            </h2>
            <p className="text-[13px] text-muted mt-1 leading-relaxed">
              {reason ?? "Sign in to run programs."} Your code stays in this browser.
            </p>
          </div>
          <IconButton label="Close" size="sm" onClick={onClose} className="-mr-2 -mt-2">
            <X className="w-4 h-4" />
          </IconButton>
        </div>

        {error && (
          <div role="alert" className="mt-4 text-[12.5px] text-danger bg-danger-soft rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {sentTo ? (
          <div className="mt-5 space-y-3" role="status">
            <div className="flex items-start gap-3 bg-surface-2 border border-line rounded-lg p-3.5">
              <Mail className="w-4 h-4 text-accent shrink-0 mt-0.5" />
              <div className="text-[13px] leading-relaxed text-muted">
                <div className="font-semibold text-fg mb-0.5">Check your inbox</div>
                We sent a sign-in link to <span className="font-medium text-fg break-all">{sentTo}</span>. It works once, for 15 minutes.
                Open it in this browser.
              </div>
            </div>
            {devLink && (
              <div className="rounded-lg border border-dashed border-accent/60 bg-accent-soft p-3 text-[12.5px] text-muted">
                <div className="font-semibold text-fg mb-1">Local development</div>
                No mail server is configured, so here is the link the email would contain:
                <a href={devLink} className="mt-2 flex items-center justify-center h-9 rounded-md bg-accent text-accent-fg font-medium hover:bg-accent-hover">
                  Open sign-in link
                </a>
              </div>
            )}
            <button onClick={() => setSentTo(null)} className="text-[12.5px] text-muted hover:text-fg underline underline-offset-2">
              Use another address
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {providers.google && (
              <a
                href={googleSignInUrl()}
                onClick={beforeLeave}
                className="w-full h-10 flex items-center justify-center gap-2.5 bg-surface border border-line-strong hover:bg-surface-2 text-fg rounded-md text-[13.5px] font-medium transition-colors"
              >
                <GoogleLogo />
                Continue with Google
              </a>
            )}

            {providers.google && providers.email && (
              <div className="flex items-center gap-3 text-[11.5px] text-faint">
                <div className="h-px flex-1 bg-line" />
                or
                <div className="h-px flex-1 bg-line" />
              </div>
            )}

            {providers.email && (
              <form onSubmit={submit} className="space-y-2">
                <label className="block text-[12.5px] font-medium text-muted" htmlFor="signin-email">
                  Email
                </label>
                <input
                  ref={firstFieldRef}
                  id="signin-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full h-10 bg-surface border border-line-strong rounded-md px-3 text-[13.5px] text-fg placeholder:text-faint outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft"
                />
                <Button type="submit" variant="primary" disabled={sending} className="w-full h-10 text-[13.5px]">
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Email me a sign-in link
                </Button>
              </form>
            )}

            {none && <p className="text-[13px] text-muted">This server has no sign-in method configured.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
