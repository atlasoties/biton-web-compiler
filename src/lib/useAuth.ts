// Sign-in state for the whole app (home screen and IDE): the session, the
// sign-in dialog, the URL fragments sign-in leaves behind, and keeping other
// tabs in step.

import { useCallback, useEffect, useState } from "react";

import type { AuthStatus } from "../../shared/api.ts";
import { getSession, redeemSignInLink, signOut as apiSignOut } from "./api";

/** localStorage key other tabs watch to learn of a sign-in or sign-out. */
const AUTH_CHANGED = "biton-web-compiler:auth-changed";
function announceAuthChange() {
  try {
    localStorage.setItem(AUTH_CHANGED, String(Date.now()));
  } catch {
    /* other tabs will notice on focus instead */
  }
}

/** What `#auth-error=<code>` (from a failed Google sign-in) means. */
const AUTH_ERRORS: Record<string, string> = {
  cancelled: "Google sign-in was cancelled.",
  expired: "The sign-in took too long or was started in another tab. Try again.",
  unverified: "That Google account's email address is not verified.",
  google: "Google sign-in failed. Try again.",
};

export interface SignInPrompt {
  reason?: string;
  error?: string;
}

export function useAuth(notify: (message: string) => void) {
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [signIn, setSignIn] = useState<SignInPrompt | null>(null);
  const setUser = useCallback((user: AuthStatus["user"]) => setAuth((a) => (a ? { ...a, user } : a)), []);

  const refreshSession = useCallback(async () => {
    try {
      const s = await getSession();
      setAuth(s);
      if (s.user) setSignIn(null);
      return s;
    } catch {
      return null; // the IDE's health check reports an unreachable server
    }
  }, []);

  // Signing in or out in one tab (say, from the emailed link) updates the
  // others: they hear it through localStorage, or check again on focus.
  useEffect(() => {
    refreshSession();
    const onStorage = (e: StorageEvent) => e.key === AUTH_CHANGED && refreshSession();
    const onVisible = () => document.visibilityState === "visible" && refreshSession();
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshSession]);

  const signOut = useCallback(async () => {
    try {
      await apiSignOut();
      setUser(null);
      announceAuthChange();
      notify("Signed out");
    } catch (e) {
      notify(`Sign-out failed: ${(e as Error).message}`);
    }
  }, [setUser, notify]);

  /**
   * Handle a sign-in fragment (`#login=…`, `#signed-in`, `#auth-error=…`).
   * Returns false for any other fragment.
   */
  const handleHash = useCallback(
    async (h: string): Promise<boolean> => {
      if (h.startsWith("login=")) {
        try {
          const user = await redeemSignInLink(h.slice("login=".length));
          setUser(user);
          setSignIn(null);
          refreshSession();
          announceAuthChange();
          notify(`Signed in as ${user.email}`);
        } catch (e) {
          setSignIn({ error: (e as Error).message.replace(/ \(HTTP \d+\)$/, "") });
        }
        return true;
      }
      if (h === "signed-in") {
        const s = await refreshSession();
        if (s?.user) {
          announceAuthChange();
          notify(`Signed in as ${s.user.email}`);
        }
        return true;
      }
      if (h.startsWith("auth-error=")) {
        setSignIn({ error: AUTH_ERRORS[h.slice("auth-error=".length)] ?? AUTH_ERRORS.google });
        return true;
      }
      return false;
    },
    [setUser, refreshSession, notify],
  );

  return {
    auth,
    signIn,
    openSignIn: (reason?: string) => setSignIn(reason ? { reason } : {}),
    closeSignIn: () => setSignIn(null),
    setUser,
    signOut,
    handleHash,
  };
}

export type Auth = ReturnType<typeof useAuth>;
