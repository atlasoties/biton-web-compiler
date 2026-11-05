import { useMemo, useState, type ComponentProps } from "react";
import { BookOpen, ChevronRight, FileCode2, Files, Library, Search, X } from "lucide-react";

import type { Example } from "../../examples";
import { highlight } from "../../lib/highlight";
import { REFERENCE, STDLIB } from "../../reference";
import FileExplorer from "../files/FileExplorer";
import { IconButton, SectionTitle, cx } from "../ui";

export type SidePanel = "files" | "language" | "stdlib";

const PANELS: Array<{ key: SidePanel; label: string; Icon: typeof Files }> = [
  { key: "files", label: "Explorer", Icon: Files },
  { key: "language", label: "Language reference", Icon: BookOpen },
  { key: "stdlib", label: "Standard library", Icon: Library },
];

/** The thin vertical bar of panel icons on the far left. */
export function ActivityRail({ active, setActive }: { active: SidePanel | null; setActive: (p: SidePanel | null) => void }) {
  return (
    <nav className="w-12 shrink-0 flex flex-col items-center gap-1 py-2 border-r border-line bg-surface" aria-label="Panels">
      {PANELS.map(({ key, label, Icon }) => (
        <button
          key={key}
          onClick={() => setActive(active === key ? null : key)}
          aria-label={label}
          title={label}
          aria-pressed={active === key}
          className={cx(
            "relative w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
            active === key ? "text-fg bg-active" : "text-faint hover:text-fg hover:bg-hover",
          )}
        >
          {active === key && <span className="absolute -left-[7px] top-2 bottom-2 w-[2px] rounded-full bg-accent" />}
          <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
        </button>
      ))}
    </nav>
  );
}

interface SidebarProps {
  panel: SidePanel;
  close: () => void;
  examples: Example[];
  currentExample: string | null;
  loadExample: (key: string) => void;
  explorer: ComponentProps<typeof FileExplorer>;
}

function Snippet({ src }: { src: string }) {
  return <pre className="font-mono text-[11.5px] leading-[1.6] whitespace-pre-wrap break-words text-fg">{highlight(src)}</pre>;
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="px-3 pt-3">
      <label className="flex items-center gap-2 h-8 px-2.5 rounded-md border border-line bg-surface-2 focus-within:border-accent text-faint">
        <Search className="w-3.5 h-3.5 shrink-0" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-transparent outline-none text-[12.5px] text-fg placeholder:text-faint"
          spellCheck={false}
        />
        {value && (
          <button onClick={() => onChange("")} aria-label="Clear search" className="hover:text-fg">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </label>
    </div>
  );
}

const matches = (q: string, ...texts: Array<string | undefined>) => {
  const s = q.trim().toLowerCase();
  return !s || texts.some((t) => t?.toLowerCase().includes(s));
};

export default function Sidebar(p: SidebarProps) {
  const [query, setQuery] = useState("");
  const [showExamples, setShowExamples] = useState(true);
  const title = PANELS.find((x) => x.key === p.panel)!.label;

  const reference = useMemo(
    () =>
      REFERENCE.map((s) => ({ ...s, items: matches(query, s.title) ? s.items : s.items.filter((i) => matches(query, i.code, i.note)) })).filter(
        (s) => s.items.length > 0,
      ),
    [query],
  );
  const stdlib = useMemo(
    () =>
      STDLIB.map((m) => ({ ...m, items: matches(query, m.module) ? m.items : m.items.filter((i) => matches(query, i)) })).filter((m) => m.items.length > 0),
    [query],
  );

  return (
    <aside className="w-72 max-w-[85vw] h-full flex flex-col bg-surface border-r border-line" aria-label={title}>
      <div className="h-10 shrink-0 flex items-center justify-between pl-3 pr-1.5 border-b border-line">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{title}</span>
        <IconButton label="Close panel" size="sm" onClick={p.close}>
          <X className="w-3.5 h-3.5" />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto pb-6">
        {p.panel === "files" && (
          <>
            <FileExplorer {...p.explorer} />

            <button
              type="button"
              onClick={() => setShowExamples((v) => !v)}
              aria-expanded={showExamples}
              className="w-full flex items-center gap-1 px-2 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint hover:text-muted"
            >
              <ChevronRight className={cx("w-3.5 h-3.5 transition-transform", showExamples && "rotate-90")} />
              Examples
            </button>
            {showExamples && (
              <div className="px-1.5 space-y-px">
                <p className="px-2 pb-1 text-[11px] text-faint">Opens in the current file (undo brings your code back).</p>
                {p.examples.map((ex) => (
                  <button
                    key={ex.key}
                    onClick={() => p.loadExample(ex.key)}
                    className={cx(
                      "w-full text-left px-2 py-2 rounded-md transition-colors group",
                      p.currentExample === ex.key ? "bg-active" : "hover:bg-hover",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <FileCode2 className="w-3.5 h-3.5 text-faint group-hover:text-accent shrink-0" />
                      <span className="text-[13px] font-medium text-fg truncate">{ex.title}</span>
                    </div>
                    <div className="pl-[22px] text-[11.5px] leading-snug text-faint mt-0.5">{ex.desc}</div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {p.panel === "language" && (
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Search the language…" />
            {reference.map((section) => (
              <div key={section.title}>
                <SectionTitle>{section.title}</SectionTitle>
                <div className="px-3 space-y-1.5">
                  {section.items.map((item, i) => (
                    <div key={i} className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
                      <Snippet src={item.code} />
                      {item.note && <div className="text-[11px] text-faint leading-snug mt-0.5">{item.note}</div>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {reference.length === 0 && <p className="px-3 pt-4 text-[12.5px] text-faint">Nothing matches “{query}”.</p>}
          </>
        )}

        {p.panel === "stdlib" && (
          <>
            <SearchBox value={query} onChange={setQuery} placeholder="Search the standard library…" />
            {stdlib.map((m) => (
              <div key={m.module}>
                <SectionTitle>
                  <span className="font-mono normal-case tracking-normal text-[12px] text-fg">{m.module}</span>
                </SectionTitle>
                <div className="px-3 space-y-1.5">
                  <div className="rounded-md border border-line bg-surface-2 px-2.5 py-1.5">
                    <Snippet src={m.import} />
                  </div>
                  <div className="rounded-md border border-line px-2.5 py-1.5">
                    <Snippet src={m.items.join("\n")} />
                  </div>
                </div>
              </div>
            ))}
            {stdlib.length === 0 && <p className="px-3 pt-4 text-[12.5px] text-faint">Nothing matches “{query}”.</p>}
          </>
        )}
      </div>

    </aside>
  );
}
