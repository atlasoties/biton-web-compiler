import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Home, Loader2, Monitor, Moon, PanelLeft, PanelRight, Play, Share2, Sparkles, Square, Sun, WandSparkles } from "lucide-react";

import { OPT_LEVELS, type OptLevel } from "../../../shared/api.ts";
import type { Busy } from "../../lib/state";
import type { ThemePref } from "../../lib/theme";
import { PromptDialog } from "../Dialog";
import { Button, IconButton, Kbd, Logo, cx } from "../ui";

interface TopBarProps {
  busy: Busy;
  run: () => void;
  stop: () => void;
  format: () => void;
  share: () => void;
  opt: OptLevel;
  setOpt: (o: OptLevel) => void;
  themePref: ThemePref;
  setThemePref: (p: ThemePref) => void;
  account: ReactNode;
  showSidebar: boolean;
  toggleSidebar: () => void;
  showPanel: boolean;
  togglePanel: () => void;
  /** The server has an AI provider configured. */
  aiAvailable: boolean;
  /** AI completion is actively running (configured, switched on and signed in if needed). */
  aiEnabled: boolean;
  toggleAI: () => void;
  /** The open file (or example) shown after the project name. */
  title: string;
  projectName: string;
  /** Back to the project list. */
  onHome: () => void;
  onRenameProject: (name: string) => void;
}

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl";

/** A small popover menu anchored under its button; closes on outside click and Escape. */
function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  return { open, setOpen, ref };
}

const OPT_INFO: Record<OptLevel, string> = {
  O0: "No optimisation, fastest compile",
  O1: "Basic optimisation",
  O2: "Default: fast code",
  O3: "Aggressive optimisation",
};

function OptMenu({ opt, setOpt, disabled }: { opt: OptLevel; setOpt: (o: OptLevel) => void; disabled: boolean }) {
  const m = useMenu();
  return (
    <div ref={m.ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => m.setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={m.open}
        aria-label={`Optimisation level -${opt}`}
        title="Optimisation level"
        className="h-8 pl-2 pr-1.5 rounded-r-md bg-run text-white dark:text-[#04170b] hover:bg-run-hover border-l border-black/15 flex items-center gap-0.5 text-[12px] font-mono font-semibold disabled:opacity-50"
      >
        -{opt}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {m.open && (
        <div role="menu" className="absolute left-1/2 -translate-x-1/2 top-10 z-50 w-64 p-1 rounded-lg border border-line bg-surface shadow-pop animate-pop">
          <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Optimisation</div>
          {OPT_LEVELS.map((o) => (
            <button
              key={o}
              role="menuitemradio"
              aria-checked={o === opt}
              onClick={() => {
                setOpt(o);
                m.setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left hover:bg-hover"
            >
              <span className="w-4">{o === opt && <Check className="w-3.5 h-3.5 text-accent" />}</span>
              <span className="font-mono text-[12.5px] font-semibold text-fg w-7">-{o}</span>
              <span className="text-xs text-muted">{OPT_INFO[o]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const THEMES: Array<{ key: ThemePref; label: string; Icon: typeof Sun }> = [
  { key: "light", label: "Light", Icon: Sun },
  { key: "dark", label: "Dark", Icon: Moon },
  { key: "system", label: "System", Icon: Monitor },
];

export function ThemeMenu({ pref, setPref }: { pref: ThemePref; setPref: (p: ThemePref) => void }) {
  const m = useMenu();
  const Current = THEMES.find((t) => t.key === pref)!.Icon;
  return (
    <div ref={m.ref} className="relative">
      <IconButton label="Theme" onClick={() => m.setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={m.open} active={m.open}>
        <Current className="w-4 h-4" />
      </IconButton>
      {m.open && (
        <div role="menu" className="absolute right-0 top-10 z-50 w-40 p-1 rounded-lg border border-line bg-surface shadow-pop animate-pop">
          {THEMES.map(({ key, label, Icon }) => (
            <button
              key={key}
              role="menuitemradio"
              aria-checked={pref === key}
              onClick={() => {
                setPref(key);
                m.setOpen(false);
              }}
              className={cx("w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] hover:bg-hover", pref === key ? "text-fg" : "text-muted")}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1 text-left">{label}</span>
              {pref === key && <Check className="w-3.5 h-3.5 text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopBar(p: TopBarProps) {
  const running = p.busy === "run";
  const [renaming, setRenaming] = useState(false);
  return (
    <header className="h-12 shrink-0 flex items-center gap-1.5 sm:gap-2 px-1.5 sm:px-3 border-b border-line bg-surface">
      {/* left */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <IconButton label="Toggle side panel" onClick={p.toggleSidebar} active={p.showSidebar} aria-pressed={p.showSidebar}>
          <PanelLeft className="w-4 h-4" />
        </IconButton>
        <div className="flex items-center gap-1 min-w-0 pl-1">
          <button
            type="button"
            onClick={p.onHome}
            title="All projects"
            aria-label="All projects"
            className="group relative w-7 h-7 shrink-0 rounded-md flex items-center justify-center hover:bg-hover"
          >
            <Logo className="w-6 h-6 group-hover:opacity-0 transition-opacity" />
            <Home className="w-4 h-4 absolute opacity-0 group-hover:opacity-100 text-fg transition-opacity" />
          </button>
          <div className="flex items-center gap-1 min-w-0 text-[13px]">
            <button
              type="button"
              onClick={() => setRenaming(true)}
              title="Rename project"
              className="font-semibold text-fg truncate max-w-[40vw] sm:max-w-[220px] px-1.5 h-7 rounded-md hover:bg-hover"
            >
              {p.projectName}
            </button>
            <span className="text-faint hidden md:inline">/</span>
            <span className="text-muted truncate hidden md:inline">{p.title}</span>
          </div>
        </div>
        {renaming && (
          <PromptDialog
            title="Rename project"
            label="Project name"
            initialValue={p.projectName}
            confirmLabel="Rename"
            validate={(v) => (v.trim().length > 80 ? "Use at most 80 characters." : null)}
            onConfirm={(v) => {
              setRenaming(false);
              p.onRenameProject(v.trim());
            }}
            onClose={() => setRenaming(false)}
          />
        )}
      </div>

      {/* centre: run */}
      <div className="flex items-center shrink-0">
        {running ? (
          <Button variant="danger" onClick={p.stop} className="w-[118px]" title="Stop (Esc)">
            <Square className="w-3.5 h-3.5 fill-current" />
            Stop
          </Button>
        ) : (
          <div className="flex items-center">
            <button
              type="button"
              onClick={p.run}
              title={`Compile and run (${MOD}+Enter)`}
              className="h-8 pl-3 pr-3.5 rounded-l-md bg-run text-white dark:text-[#04170b] hover:bg-run-hover flex items-center gap-1.5 text-[13px] font-semibold shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Run
            </button>
            <OptMenu opt={p.opt} setOpt={p.setOpt} disabled={false} />
          </div>
        )}
      </div>

      {/* right */}
      <div className="flex items-center justify-end gap-0.5 sm:gap-1 flex-1 min-w-0">
        <div className="hidden sm:flex items-center gap-1">
          <IconButton
            label={p.aiEnabled ? "AI completion on" : "AI completion off"}
            title={
              !p.aiAvailable
                ? "AI completion is not configured on the server"
                : p.aiEnabled
                  ? "AI completion is on (click to turn off)"
                  : "AI completion is off (click to turn on)"
            }
            onClick={p.toggleAI}
            disabled={!p.aiAvailable}
            active={p.aiEnabled}
          >
            <WandSparkles className="w-4 h-4" />
          </IconButton>
          <IconButton label="Format document (Shift+Alt+F)" onClick={p.format} disabled={p.busy === "format"}>
            {p.busy === "format" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          </IconButton>
          <IconButton label="Copy a share link" onClick={p.share}>
            <Share2 className="w-4 h-4" />
          </IconButton>
        </div>
        <ThemeMenu pref={p.themePref} setPref={p.setThemePref} />
        <div className="w-px h-5 bg-line mx-1 hidden sm:block" />
        {p.account}
        <IconButton label="Toggle output panel" onClick={p.togglePanel} active={p.showPanel} aria-pressed={p.showPanel}>
          <PanelRight className="w-4 h-4" />
        </IconButton>
      </div>
    </header>
  );
}

export { Kbd };
