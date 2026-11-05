import { useEffect, useRef, useState } from "react";
import { LogIn, LogOut } from "lucide-react";

import type { AuthStatus } from "../../../shared/api.ts";
import { Button } from "../ui";

interface AccountMenuProps {
  auth: AuthStatus | null;
  openSignIn: () => void;
  signOut: () => void;
}

/** The header's account control: "Sign in", or the signed-in user with a sign-out menu. */
export default function AccountMenu({ auth, openSignIn, signOut }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!auth || (!auth.user && !auth.providers.google && !auth.providers.email)) return null;

  if (!auth.user) {
    return (
      <Button variant="secondary" onClick={openSignIn} title="Sign in" className="px-2.5 sm:px-3">
        <LogIn className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Sign in</span>
      </Button>
    );
  }

  const u = auth.user;
  const initial = (u.name || u.email).trim()[0]?.toUpperCase() ?? "?";
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-7 h-7 mx-0.5 rounded-full bg-accent text-accent-fg text-[12px] font-semibold flex items-center justify-center hover:opacity-90 ring-2 ring-transparent hover:ring-accent-soft"
        title={u.email}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${u.email}`}
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-10 z-50 w-64 bg-surface border border-line rounded-lg shadow-pop p-1 text-[13px] animate-pop">
          <div className="px-2.5 py-2 mb-1 border-b border-line">
            {u.name !== u.email && <div className="font-medium text-fg truncate">{u.name}</div>}
            <div className="text-muted truncate text-[12.5px]">{u.email}</div>
            <div className="text-[11.5px] text-faint mt-0.5">via {u.provider === "google" ? "Google" : "email link"}</div>
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-muted hover:bg-hover hover:text-fg"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
