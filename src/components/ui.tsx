// Small building blocks shared by the whole UI, drawn from the theme tokens.

import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";

import wordmarkUrl from "../assets/biton-wordmark.png";

export const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  size?: "sm" | "md";
};

/** A square icon button; `label` is its accessible name and tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, size = "md", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={rest.title ?? label}
      className={cx(
        "inline-flex items-center justify-center rounded-md transition-colors shrink-0",
        "text-muted hover:text-fg hover:bg-hover active:bg-active disabled:opacity-40 disabled:pointer-events-none",
        size === "md" ? "w-8 h-8" : "w-6 h-6",
        active && "text-fg bg-active",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "run" | "danger" | "secondary" | "ghost";
  size?: "sm" | "md";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors select-none shrink-0",
        "disabled:opacity-50 disabled:pointer-events-none",
        size === "md" ? "h-8 px-3 text-[13px]" : "h-7 px-2.5 text-xs",
        variant === "primary" && "bg-accent text-accent-fg hover:bg-accent-hover shadow-sm",
        variant === "run" && "bg-run text-white hover:bg-run-hover shadow-sm dark:text-[#04170b]",
        variant === "danger" && "bg-danger text-white hover:opacity-90 shadow-sm dark:text-[#1f0606]",
        variant === "secondary" && "bg-surface border border-line-strong text-fg hover:bg-surface-2",
        variant === "ghost" && "text-muted hover:text-fg hover:bg-hover",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex items-center h-[18px] min-w-[18px] px-1 rounded border border-line-strong bg-surface-2 text-[10px] font-mono text-muted leading-none">
      {children}
    </kbd>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "danger" | "warning" | "accent" | "success"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex items-center justify-center h-[18px] min-w-[18px] px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums leading-none",
        tone === "neutral" && "bg-surface-3 text-muted",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "accent" && "bg-accent-soft text-accent",
        tone === "success" && "bg-surface-3 text-success",
      )}
    >
      {children}
    </span>
  );
}

export interface TabDef<K extends string> {
  key: K;
  label: string;
  icon?: ReactNode;
  badge?: ReactNode;
}

/** A row of tabs, styled like an editor's panel tabs. */
export function Tabs<K extends string>({
  tabs,
  value,
  onChange,
  className,
  trailing,
}: {
  tabs: TabDef<K>[];
  value: K;
  onChange: (k: K) => void;
  className?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className={cx("flex items-center h-10 px-1.5 gap-0.5 border-b border-line bg-surface shrink-0 overflow-x-auto", className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cx(
            "relative h-8 px-2 sm:px-2.5 rounded-md flex items-center gap-1.5 text-[12.5px] font-medium transition-colors whitespace-nowrap shrink-0",
            value === t.key ? "text-fg bg-surface-2" : "text-muted hover:text-fg hover:bg-hover",
          )}
        >
          {t.icon}
          <span className={cx(value !== t.key && "hidden min-[480px]:inline")}>{t.label}</span>
          {t.badge}
        </button>
      ))}
      <div className="flex-1" />
      {trailing}
    </div>
  );
}

/** A divider-free section heading for panels. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-4 pb-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">{children}</span>
      {right}
    </div>
  );
}

/**
 * The Biton mark: the gold signal in the navy hexagon (drawn from the brand
 * artwork in public/biton-logo.png). At small sizes the strokes are drawn a
 * little bolder so they survive being 24px wide.
 */
export function Logo({ className, detailed = false }: { className?: string; detailed?: boolean }) {
  const id = useId().replace(/:/g, "");
  const width = detailed ? 13 : 24;
  return (
    <svg viewBox="690 97 540 540" className={className} role="img" aria-label="Biton">
      <defs>
        <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1="1100" y1="230" x2="818" y2="520">
          <stop offset="0" stopColor="#ffb733" />
          <stop offset="1" stopColor="#ffdb98" />
        </linearGradient>
      </defs>
      <path d="M960 102 L1178 235 V500 L960 632 L743 500 V235 Z" fill="#051139" stroke="var(--logo-edge)" strokeWidth="14" strokeLinejoin="round" />
      <g fill="none" stroke={`url(#g${id})`} strokeWidth={width} strokeLinecap="round" strokeLinejoin="miter" strokeMiterlimit="8">
        <path d="M959 231 V353" />
        <path d="M910 366 L959 452 L1007 366" />
        <path d="M818 385 H886 L959 512 L1031 385 H1099" />
      </g>
    </svg>
  );
}

/** The "biton" wordmark from the brand artwork. */
export function Wordmark({ className }: { className?: string }) {
  return <img src={wordmarkUrl} alt="biton" className={className} draggable={false} />;
}
