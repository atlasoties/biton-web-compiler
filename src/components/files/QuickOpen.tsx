// Ctrl/⌘+P: jump to any file by typing part of its path.

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

import { fuzzyFilter } from "../../lib/fuzzy";
import { basename, dirname } from "../../lib/project";
import { cx } from "../ui";
import { FileIcon } from "./FileIcon";

function Highlighted({ text, indices, offset }: { text: string; indices: Set<number>; offset: number }) {
  return (
    <>
      {[...text].map((ch, i) => (
        <span key={i} className={indices.has(i + offset) ? "text-accent font-semibold" : undefined}>
          {ch}
        </span>
      ))}
    </>
  );
}

export default function QuickOpen({
  files,
  recent,
  onOpen,
  onClose,
}: {
  files: string[];
  /** Recently used files, most recent first; shown first when nothing is typed. */
  recent: string[];
  onOpen: (path: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const list = useRef<HTMLDivElement | null>(null);

  const results = useMemo(() => {
    if (query.trim()) return fuzzyFilter(query, files);
    const order = [...recent.filter((p) => files.includes(p)), ...files.filter((p) => !recent.includes(p))];
    return order.slice(0, 50).map((path) => ({ path, score: 0, indices: [] as number[] }));
  }, [query, files, recent]);

  useEffect(() => setSelected(0), [query]);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const open = (i: number) => {
    const r = results[i];
    if (!r) return;
    onClose();
    onOpen(r.path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      open(selected);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[65] flex justify-center items-start pt-[12vh] px-4 bg-[var(--overlay)]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Go to file" className="w-full max-w-[560px] rounded-xl border border-line bg-surface shadow-pop overflow-hidden animate-pop" onKeyDown={onKeyDown}>
        <label className="flex items-center gap-2.5 h-11 px-3.5 border-b border-line">
          <Search className="w-4 h-4 text-faint shrink-0" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Go to file…"
            spellCheck={false}
            autoComplete="off"
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-open-list"
            aria-activedescendant={results[selected] ? `quick-open-${selected}` : undefined}
            className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-fg placeholder:text-faint"
          />
        </label>
        <div ref={list} id="quick-open-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-1">
          {results.length === 0 && <div className="px-3 py-6 text-center text-[13px] text-faint">No matching files</div>}
          {results.map((r, i) => {
            const idx = new Set(r.indices);
            const name = basename(r.path);
            const dir = dirname(r.path);
            return (
              <button
                key={r.path}
                id={`quick-open-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === selected}
                onMouseMove={() => setSelected(i)}
                onClick={() => open(i)}
                className={cx("w-full flex items-center gap-2.5 h-8 px-2.5 rounded-md text-left", i === selected && "bg-accent-soft")}
              >
                <FileIcon path={r.path} />
                <span className="text-[13px] text-fg truncate">
                  <Highlighted text={name} indices={idx} offset={r.path.length - name.length} />
                </span>
                {dir && (
                  <span className="text-[12px] text-faint truncate">
                    <Highlighted text={dir} indices={idx} offset={0} />
                  </span>
                )}
                {!query && i < recent.length && recent.includes(r.path) && <span className="ml-auto text-[11px] text-faint">recent</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
