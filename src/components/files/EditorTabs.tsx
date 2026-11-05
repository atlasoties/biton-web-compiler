// Open files as tabs above the editor: click to switch, middle-click or × to
// close, drag to reorder, and a context menu for the usual close actions.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ClipboardCopy, FolderTree, Play, X } from "lucide-react";

import { basename, dirname } from "../../lib/project";
import { useContextMenu } from "../ContextMenu";
import { cx } from "../ui";
import { FileIcon } from "./FileIcon";
import type { FileProblems } from "./FileExplorer";

interface EditorTabsProps {
  tabs: string[];
  active: string | null;
  entry: string | null;
  problems: ReadonlyMap<string, FileProblems>;
  onSelect: (path: string) => void;
  /** Close these tabs (in one step, so "close others" is a single change). */
  onClose: (paths: string[]) => void;
  onReorder: (tabs: string[]) => void;
  onReveal: (path: string) => void;
  onCopyPath: (path: string) => void;
  trailing?: ReactNode;
}

/** For tabs whose names repeat, the shortest folder suffix that tells them apart. */
function disambiguate(tabs: string[]): Map<string, string> {
  const out = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const t of tabs) byName.set(basename(t), [...(byName.get(basename(t)) ?? []), t]);
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    for (const t of group) out.set(t, dirname(t) || "/");
  }
  return out;
}

export default function EditorTabs(p: EditorTabsProps) {
  const strip = useRef<HTMLDivElement | null>(null);
  const menu = useContextMenu();
  const [dragging, setDragging] = useState<string | null>(null);
  const hints = disambiguate(p.tabs);

  useEffect(() => {
    if (!p.active) return;
    strip.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(p.active)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [p.active, p.tabs.length]);

  const tabMenu = (path: string) => {
    const i = p.tabs.indexOf(path);
    return [
      { label: "Close", shortcut: "Alt+W", onSelect: () => p.onClose([path]) },
      { label: "Close Others", disabled: p.tabs.length < 2, onSelect: () => p.onClose(p.tabs.filter((t) => t !== path)) },
      { label: "Close to the Right", disabled: i === p.tabs.length - 1, onSelect: () => p.onClose(p.tabs.slice(i + 1)) },
      { label: "Close All", onSelect: () => p.onClose(p.tabs) },
      "separator" as const,
      { label: "Reveal in Explorer", icon: <FolderTree className="w-3.5 h-3.5" />, onSelect: () => p.onReveal(path) },
      { label: "Copy Path", icon: <ClipboardCopy className="w-3.5 h-3.5" />, onSelect: () => p.onCopyPath(path) },
    ];
  };

  return (
    <div className="h-10 shrink-0 flex items-end border-b border-line bg-surface">
      <div
        ref={strip}
        role="tablist"
        aria-label="Open files"
        className="flex-1 min-w-0 h-full flex items-end gap-px pl-1.5 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
        onWheel={(e) => {
          // A vertical wheel scrolls the tab strip sideways.
          if (e.deltaY && strip.current) strip.current.scrollLeft += e.deltaY;
        }}
      >
        {p.tabs.map((path) => {
          const active = path === p.active;
          const problems = p.problems.get(path);
          return (
            <div
              key={path}
              data-path={path}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              title={path}
              draggable
              onDragStart={(e) => {
                setDragging(path);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", path);
              }}
              onDragEnd={() => setDragging(null)}
              onDragOver={(e) => {
                if (!dragging || dragging === path) return;
                e.preventDefault();
                const next = p.tabs.filter((t) => t !== dragging);
                next.splice(next.indexOf(path) + (p.tabs.indexOf(dragging) < p.tabs.indexOf(path) ? 1 : 0), 0, dragging);
                p.onReorder(next);
              }}
              onClick={() => p.onSelect(path)}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault(); // no autoscroll
              }}
              onAuxClick={(e) => {
                if (e.button === 1) p.onClose([path]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") p.onSelect(path);
              }}
              onContextMenu={(e) => menu.open(e, tabMenu(path))}
              className={cx(
                "group relative h-[calc(100%-6px)] max-w-[220px] shrink-0 flex items-center gap-1.5 pl-2.5 pr-1 rounded-t-md border border-b-0 text-[12.5px] cursor-pointer select-none -mb-px",
                active ? "bg-[var(--editor-bg)] border-line text-fg" : "border-transparent text-muted hover:text-fg hover:bg-hover",
                dragging === path && "opacity-50",
              )}
            >
              {active && <span className="absolute inset-x-0 -top-px h-[2px] rounded-t-md bg-accent" />}
              <FileIcon path={path} />
              <span className={cx("truncate", active && "font-medium", problems?.errors ? "text-danger" : problems?.warnings ? "text-warning" : undefined)}>
                {basename(path)}
              </span>
              {hints.has(path) && <span className="text-[11px] text-faint truncate max-w-[80px]">{hints.get(path)}</span>}
              {path === p.entry && <Play className="w-2.5 h-2.5 text-run fill-current shrink-0" aria-label="entry point" />}
              <button
                type="button"
                tabIndex={-1}
                aria-label={`Close ${basename(path)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onClose([path]);
                }}
                className={cx(
                  "w-5 h-5 shrink-0 flex items-center justify-center rounded hover:bg-active",
                  active ? "text-muted" : "text-transparent group-hover:text-muted",
                )}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
      {p.trailing && <div className="flex items-center gap-0.5 self-center px-2 shrink-0">{p.trailing}</div>}
      {menu.element}
    </div>
  );
}
