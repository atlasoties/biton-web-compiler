// A right-click menu: positioned at the pointer (kept on screen), keyboard
// navigable (↑/↓, Home/End, Enter, Esc), closed by clicking elsewhere,
// scrolling, resizing or leaving the window.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cx } from "./ui";

export type MenuItem =
  | {
      label: string;
      icon?: ReactNode;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
      onSelect: () => void;
    }
  | "separator";

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });
  const restore = useRef<HTMLElement | null>(null);
  const actionable = menu.items.map((it, i) => (it !== "separator" && !it.disabled ? i : -1)).filter((i) => i >= 0);
  const [active, setActive] = useState(-1);

  // Keep the menu inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4));
    const top = menu.y + r.height > window.innerHeight - 4 ? Math.max(4, menu.y - r.height) : menu.y;
    setPos({ left, top });
  }, [menu.x, menu.y]);

  useEffect(() => {
    restore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    const close = () => onClose();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", close, true);
      restore.current?.focus?.();
    };
  }, [onClose]);

  const choose = (i: number) => {
    const it = menu.items[i];
    if (it === "separator" || it.disabled) return;
    onClose();
    it.onSelect();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    const at = actionable.indexOf(active);
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(actionable[(at + 1) % actionable.length]);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(actionable[(at - 1 + actionable.length) % actionable.length]);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(actionable[0]);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(actionable[actionable.length - 1]);
    } else if ((e.key === "Enter" || e.key === " ") && active >= 0) {
      e.preventDefault();
      choose(active);
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: pos.left, top: pos.top }}
      className="fixed z-[70] min-w-[200px] max-w-[300px] p-1 rounded-lg border border-line bg-surface shadow-pop outline-none animate-pop text-[12.5px]"
    >
      {menu.items.map((it, i) =>
        it === "separator" ? (
          <div key={i} role="separator" className="my-1 h-px bg-line" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(i)}
            className={cx(
              "w-full flex items-center gap-2.5 h-7 px-2 rounded-md text-left disabled:opacity-40",
              active === i && "bg-hover",
              it.danger ? "text-danger" : "text-fg",
            )}
          >
            <span className="w-4 flex items-center justify-center text-muted">{it.icon}</span>
            <span className="flex-1 truncate">{it.label}</span>
            {it.shortcut && <span className="text-[11px] text-faint">{it.shortcut}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/** State for one context menu: `open(e, items)` from an onContextMenu handler. */
export function useContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const open = (e: { clientX: number; clientY: number; preventDefault: () => void; stopPropagation: () => void }, items: MenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const element = menu ? <ContextMenu menu={menu} onClose={() => setMenu(null)} /> : null;
  return { open, element, isOpen: menu !== null };
}
