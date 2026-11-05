// Inline AI suggestions ("ghost text"), as in Copilot or Cursor.
//
// After a short pause in typing, the text around the cursor goes to the API's
// /api/complete (which holds the provider key) and the answer is drawn after
// the cursor in a faint colour. Tab accepts it, Ctrl/⌘+→ accepts one word,
// Esc dismisses it, and Alt+\ asks for one on demand. Typing the suggested
// characters keeps the rest of the suggestion without a new request.
//
// Requests are debounced, cancelled when the text changes, cached, and backed
// off on rate limits and sign-in errors; AI failures never get in the way of
// typing.

import { completionStatus } from "@codemirror/autocomplete";
import { Prec, StateEffect, StateField, type EditorState, type Extension, type TransactionSpec } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap, type DecorationSet, type ViewUpdate } from "@codemirror/view";

import { AI_CONTEXT_AFTER, AI_CONTEXT_BEFORE, type CompleteRequest, type CompleteResponse } from "../../shared/api.ts";
import { ApiError, RateLimitError, SignInRequiredError, completeWithAI, isAbort } from "../lib/api.ts";

export interface Suggestion {
  /** Document position the suggestion is inserted at. */
  pos: number;
  text: string;
}

export type AIStatus =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "suggesting" }
  | { state: "signin" }
  | { state: "limited"; retryAfter: number }
  | { state: "error"; message: string };

export interface InlineAIOptions {
  /** Path of the file being edited (read at request time). */
  fileName: () => string;
  /** Other project files worth showing the model, such as the modules this file imports. */
  related?: () => CompleteRequest["related"];
  onStatus?: (s: AIStatus) => void;
  /** Pause after typing before a request (ms). */
  delay?: number;
  /** For tests. */
  request?: (req: CompleteRequest, signal: AbortSignal) => Promise<CompleteResponse>;
}

const DEFAULT_DELAY_MS = 450;
const CACHE_SIZE = 40;

// ── state ─────────────────────────────────────────────────────────────────

export const setSuggestion = StateEffect.define<Suggestion | null>();

/** The visible suggestion. It survives typing that matches it and nothing else. */
export const suggestionField = StateField.define<Suggestion | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setSuggestion)) return e.value;
    if (!value) return null;
    if (tr.docChanged) {
      // Typing the next characters of the suggestion consumes them.
      let typed: string | null = null;
      let ok = true;
      tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
        if (typed !== null || fromA !== value.pos || toA !== fromA) ok = false;
        else typed = inserted.toString();
      });
      if (!ok || typed === null || !value.text.startsWith(typed)) return null;
      const rest = value.text.slice((typed as string).length);
      const pos = value.pos + (typed as string).length;
      return rest && tr.state.selection.main.empty && tr.state.selection.main.head === pos ? { pos, text: rest } : null;
    }
    if (tr.selection) {
      const sel = tr.state.selection.main;
      if (!sel.empty || sel.head !== value.pos || tr.state.selection.ranges.length > 1) return null;
    }
    return value;
  },
});

/** The change that inserts the suggestion (or its first `length` characters). */
export function acceptSuggestion(state: EditorState, length?: number): TransactionSpec | null {
  const s = state.field(suggestionField, false);
  if (!s) return null;
  const text = length === undefined ? s.text : s.text.slice(0, length);
  if (!text) return null;
  return {
    changes: { from: s.pos, insert: text },
    selection: { anchor: s.pos + text.length },
    scrollIntoView: true,
    userEvent: "input.complete",
  };
}

/** Length of the next word of a suggestion, with the whitespace before it. */
export function nextWordLength(text: string): number {
  const m = /^(\s*[\p{L}\p{N}_]+|\s*[^\p{L}\p{N}_\s]+|\s+)/u.exec(text);
  return m ? m[0].length : text.length;
}

// ── when to ask ───────────────────────────────────────────────────────────

/**
 * Whether the cursor is a sensible place for an automatic suggestion: a single
 * empty selection, not in the middle of a word, not in a comment or string.
 */
export function wantsSuggestion(state: EditorState): boolean {
  const sel = state.selection;
  if (sel.ranges.length > 1 || !sel.main.empty) return false;
  const pos = sel.main.head;
  if (/[\p{L}\p{N}_]/u.test(state.sliceDoc(pos, pos + 1))) return false;
  const line = state.doc.lineAt(pos);
  const before = line.text.slice(0, pos - line.from);
  // A line comment, or an open string literal (an interpolation `{` inside one is code).
  let inString = false;
  for (let i = 0; i < before.length; i++) {
    const c = before[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
      else if (c === "{") return true;
    } else if (c === '"') inString = true;
    else if (c === "/" && before[i + 1] === "/") return false;
  }
  return !inString;
}

/** The request for a suggestion at the cursor. */
export function requestAt(state: EditorState, file: string, related?: CompleteRequest["related"]): CompleteRequest {
  const pos = state.selection.main.head;
  const doc = state.doc;
  const req: CompleteRequest = {
    before: doc.sliceString(Math.max(0, pos - AI_CONTEXT_BEFORE), pos),
    after: doc.sliceString(pos, Math.min(doc.length, pos + AI_CONTEXT_AFTER)),
    file,
  };
  if (related?.length) req.related = related;
  return req;
}

/** Undo the server's view of indentation: drop leading spaces already typed on a blank line. */
function fitToCursor(state: EditorState, text: string): string {
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  const typed = line.text.slice(0, pos - line.from);
  return !typed.trim() && typed && text.startsWith(typed) ? text.slice(typed.length) : text;
}

// ── drawing ───────────────────────────────────────────────────────────────

class GhostText extends WidgetType {
  readonly text: string;
  constructor(text: string) {
    super();
    this.text = text;
  }
  eq(other: GhostText) {
    return other.text === this.text;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-ai-ghost";
    span.textContent = this.text;
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

const ghostDecorations = EditorView.decorations.compute([suggestionField], (state): DecorationSet => {
  const s = state.field(suggestionField);
  if (!s) return Decoration.none;
  return Decoration.set([Decoration.widget({ widget: new GhostText(s.text), side: 1 }).range(s.pos)]);
});

const ghostTheme = EditorView.baseTheme({
  ".cm-ai-ghost": { color: "var(--text-faint)", opacity: "0.85", fontStyle: "italic", whiteSpace: "pre", pointerEvents: "none" },
});

// ── fetching ──────────────────────────────────────────────────────────────

function createFetcher(opts: InlineAIOptions) {
  const request = opts.request ?? completeWithAI;
  const delay = opts.delay ?? DEFAULT_DELAY_MS;
  const cache = new Map<string, string>();
  let blockedUntil = 0;
  let failures = 0;
  let lastStatus: AIStatus["state"] | null = null;
  const status = (s: AIStatus) => {
    // "loading"/"idle" flip often; only report real changes.
    if (s.state === lastStatus && s.state !== "limited" && s.state !== "error") return;
    lastStatus = s.state;
    opts.onStatus?.(s);
  };

  return ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | null = null;
      inflight: AbortController | null = null;
      view: EditorView;

      constructor(view: EditorView) {
        this.view = view;
      }

      update(u: ViewUpdate) {
        const typed = u.transactions.some((tr) => tr.isUserEvent("input.type") || tr.isUserEvent("input.paste") || tr.isUserEvent("delete"));
        const visible = u.state.field(suggestionField);
        if (u.docChanged || u.selectionSet) this.cancel();
        if (typed && !visible && !u.transactions.some((tr) => tr.isUserEvent("input.complete"))) this.schedule(false);
        status(visible ? { state: "suggesting" } : this.inflight || this.timer ? { state: "loading" } : { state: "idle" });
      }

      cancel() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.inflight?.abort();
        this.inflight = null;
      }

      schedule(explicit: boolean) {
        this.cancel();
        if (explicit) void this.fetch(true);
        else this.timer = setTimeout(() => void this.fetch(false), delay);
      }

      async fetch(explicit: boolean) {
        this.timer = null;
        const view = this.view;
        const state = view.state;
        if (!explicit && (!wantsSuggestion(state) || completionStatus(state) === "active")) return;
        if (!state.selection.main.empty) return;
        if (Date.now() < blockedUntil) {
          if (explicit) status({ state: "limited", retryAfter: Math.ceil((blockedUntil - Date.now()) / 1000) });
          return;
        }
        const req = requestAt(state, opts.fileName(), opts.related?.());
        const key = `${req.file}\0${req.before.slice(-1500)}\0${req.after.slice(0, 400)}`;
        const doc = state.doc;
        const pos = state.selection.main.head;

        let text = cache.get(key);
        if (text === undefined) {
          const ac = new AbortController();
          this.inflight = ac;
          status({ state: "loading" });
          try {
            text = (await request(req, ac.signal)).completion;
            failures = 0;
            cache.set(key, text);
            if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
          } catch (e) {
            if (isAbort(e) || ac.signal.aborted) return;
            if (e instanceof RateLimitError) {
              blockedUntil = Date.now() + e.retryAfter * 1000;
              status({ state: "limited", retryAfter: e.retryAfter });
            } else if (e instanceof SignInRequiredError) {
              blockedUntil = Date.now() + 30_000;
              status({ state: "signin" });
            } else {
              // Back off after repeated failures (provider down, misconfigured).
              failures++;
              if (failures >= 3) blockedUntil = Date.now() + Math.min(60_000, 5_000 * failures);
              const status404 = e instanceof ApiError && e.status === 404;
              status({ state: "error", message: status404 ? "AI completion is not enabled on the server" : (e as Error).message });
            }
            return;
          } finally {
            if (this.inflight === ac) this.inflight = null;
          }
        }
        // Only show it if nothing moved while we waited.
        if (view.state.doc !== doc || view.state.selection.main.head !== pos) return;
        const fitted = fitToCursor(view.state, text);
        if (!fitted.trim()) {
          status({ state: "idle" });
          return;
        }
        view.dispatch({ effects: setSuggestion.of({ pos, text: fitted }) });
      }

      destroy() {
        this.cancel();
      }
    },
  );
}

export function inlineAI(opts: InlineAIOptions): Extension {
  const fetcher = createFetcher(opts);
  const trigger = (view: EditorView) => {
    const plugin = view.plugin(fetcher);
    if (!plugin) return false;
    view.dispatch({ effects: setSuggestion.of(null) });
    plugin.schedule(true);
    return true;
  };
  const accept = (view: EditorView, length?: (s: Suggestion) => number) => {
    const s = view.state.field(suggestionField, false);
    if (!s || completionStatus(view.state) === "active") return false;
    const spec = acceptSuggestion(view.state, length?.(s));
    if (!spec) return false;
    view.dispatch(spec);
    return true;
  };
  return [
    suggestionField,
    ghostDecorations,
    ghostTheme,
    fetcher,
    Prec.highest(
      keymap.of([
        { key: "Tab", run: (v) => accept(v) },
        { key: "Mod-ArrowRight", run: (v) => accept(v, (s) => nextWordLength(s.text)) },
        {
          key: "Escape",
          run: (v) => {
            if (!v.state.field(suggestionField, false)) return false;
            v.dispatch({ effects: setSuggestion.of(null) });
            return true;
          },
        },
        { key: "Alt-\\", run: trigger, preventDefault: true },
      ]),
    ),
  ];
}
