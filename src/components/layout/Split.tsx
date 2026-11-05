import { useRef, type ReactNode } from "react";

import { cx } from "../ui";

interface SplitProps {
  /** "row": side by side; "column": stacked. */
  direction: "row" | "column";
  /** Share of the space the second pane takes, 0..1. */
  fraction: number;
  setFraction: (f: number) => void;
  defaultFraction: number;
  min?: number;
  max?: number;
  first: ReactNode;
  second: ReactNode;
}

/** Two panes and a draggable divider (double-click resets it; arrow keys move it). */
export default function Split({ direction, fraction, setFraction, defaultFraction, min = 0.18, max = 0.75, first, second }: SplitProps) {
  const box = useRef<HTMLDivElement | null>(null);
  const row = direction === "row";
  const clamp = (f: number) => Math.min(max, Math.max(min, f));

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = box.current!;
    const rect = el.getBoundingClientRect();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    document.body.style.cursor = row ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      const f = row ? (rect.right - ev.clientX) / rect.width : (rect.bottom - ev.clientY) / rect.height;
      setFraction(clamp(f));
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const grow = row ? "ArrowLeft" : "ArrowUp";
    const shrink = row ? "ArrowRight" : "ArrowDown";
    if (e.key === grow) setFraction(clamp(fraction + step));
    else if (e.key === shrink) setFraction(clamp(fraction - step));
    else return;
    e.preventDefault();
  };

  const pct = `${(fraction * 100).toFixed(2)}%`;
  return (
    <div ref={box} className={cx("flex flex-1 min-w-0 min-h-0 overflow-hidden", row ? "flex-row" : "flex-col")}>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">{first}</div>
      <div
        role="separator"
        aria-orientation={row ? "vertical" : "horizontal"}
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={Math.round(min * 100)}
        aria-valuemax={Math.round(max * 100)}
        aria-label="Resize panels"
        tabIndex={0}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
        onDoubleClick={() => setFraction(defaultFraction)}
        className={cx(
          "group relative shrink-0 bg-line z-10 outline-none",
          row ? "w-px cursor-col-resize" : "h-px cursor-row-resize",
        )}
      >
        {/* A wider invisible hit area, highlighted while hovered or focused. */}
        <div
          className={cx(
            "absolute transition-colors group-hover:bg-accent/60 group-focus-visible:bg-accent group-active:bg-accent",
            row ? "inset-y-0 -left-[3px] w-[7px]" : "inset-x-0 -top-[3px] h-[7px]",
          )}
        />
      </div>
      <div className="min-w-0 min-h-0 flex flex-col overflow-hidden shrink-0" style={row ? { width: pct } : { height: pct }}>
        {second}
      </div>
    </div>
  );
}
