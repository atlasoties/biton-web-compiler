import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Compartment, EditorSelection, EditorState, Prec } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { lintGutter, lintKeymap, setDiagnostics, type Diagnostic as CmDiagnostic } from "@codemirror/lint";

import type { Diagnostic } from "../../shared/api.ts";
import { inBuffer } from "../lib/state";
import { biton } from "./biton";

export interface EditorHandle {
  /** Replace the whole text as one undoable change, keeping unchanged parts (and the cursor) in place. */
  replaceAll(text: string): void;
  /** Put the cursor at a 1-based line and column and show it. */
  jumpTo(line: number, col: number): void;
  undo(): void;
  redo(): void;
  focus(): void;
}

export interface CursorInfo {
  line: number;
  col: number;
  selected: number;
}

interface CodeEditorProps {
  initialValue: string;
  onChange: (text: string) => void;
  onCursor?: (c: CursorInfo) => void;
  onHistory?: (h: { canUndo: boolean; canRedo: boolean }) => void;
  /** Diagnostics for the current text, or null while they are out of date. */
  diagnostics: Diagnostic[] | null;
  onRun: () => void;
  onFormat: () => void;
  onSave: () => void;
  fontSize: number;
}

const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--editor-bg)", color: "var(--syn-ident)" },
  // No ligatures: show exactly the characters typed (`<=`, not `≤`).
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.65", overscrollBehavior: "contain", fontVariantLigatures: "none" },
  ".cm-content": { padding: "12px 0 40vh", caretColor: "var(--editor-cursor)" },
  ".cm-line": { padding: "0 20px 0 8px" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--editor-cursor)" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "var(--editor-selection) !important",
  },
  ".cm-activeLine": { backgroundColor: "var(--editor-line)" },
  ".cm-gutters": { backgroundColor: "var(--editor-gutter)", color: "var(--line-number)", border: "none", paddingLeft: "6px" },
  ".cm-lineNumbers .cm-gutterElement": { minWidth: "3ch", padding: "0 10px 0 4px", fontSize: "0.92em" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--line-number-active)" },
  ".cm-foldGutter .cm-gutterElement": { color: "var(--text-faint)", cursor: "pointer", padding: "0 4px" },
  ".cm-foldPlaceholder": { backgroundColor: "var(--surface-3)", border: "1px solid var(--border)", color: "var(--text-muted)", borderRadius: "4px", padding: "0 6px", margin: "0 4px" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": { backgroundColor: "var(--editor-match)", outline: "1px solid var(--border-strong)", borderRadius: "2px" },
  ".cm-nonmatchingBracket": { color: "var(--danger)" },
  ".cm-selectionMatch": { backgroundColor: "var(--editor-match)" },
  ".cm-searchMatch": { backgroundColor: "var(--warning-soft)", outline: "1px solid var(--warning)" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "var(--accent-soft)" },
  ".cm-panels": { backgroundColor: "var(--surface-2)", color: "var(--text)", borderColor: "var(--border) !important" },
  ".cm-panels.cm-panels-top": { borderBottom: "1px solid var(--border)" },
  ".cm-panel.cm-search": { padding: "8px 10px", fontFamily: "var(--font-sans)", fontSize: "12px" },
  ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": { fontSize: "12px" },
  ".cm-textfield": {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: "6px",
    padding: "3px 8px",
    color: "var(--text)",
  },
  ".cm-button": {
    backgroundImage: "none",
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border-strong)",
    borderRadius: "6px",
    color: "var(--text)",
    padding: "3px 10px",
  },
  ".cm-panel.cm-search [name=close]": { color: "var(--text-muted)", fontSize: "16px", right: "8px" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    color: "var(--text)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    boxShadow: "var(--shadow)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul": { fontFamily: "var(--font-mono)", fontSize: "12.5px", maxHeight: "18em" },
  ".cm-tooltip-autocomplete > ul > li": { padding: "3px 10px 3px 6px !important", lineHeight: "1.5" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent-soft)", color: "var(--text)" },
  ".cm-completionDetail": { color: "var(--text-faint)", fontStyle: "normal", marginLeft: "1em" },
  ".cm-completionMatchedText": { textDecoration: "none", color: "var(--accent)", fontWeight: "600" },
  ".cm-completionIcon": { opacity: "0.7" },
  ".cm-tooltip-lint": { padding: "0" },
  ".cm-diagnostic": { padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: "12px", whiteSpace: "pre-wrap", borderLeftWidth: "3px", maxWidth: "640px" },
  ".cm-diagnostic-error": { borderLeftColor: "var(--danger)" },
  ".cm-diagnostic-warning": { borderLeftColor: "var(--warning)" },
  ".cm-diagnostic-info": { borderLeftColor: "var(--info)" },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy var(--danger)", textUnderlineOffset: "3px", textDecorationSkipInk: "none" },
  ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline wavy var(--warning)", textUnderlineOffset: "3px", textDecorationSkipInk: "none" },
  ".cm-lintRange-info": { backgroundImage: "none", textDecoration: "underline dotted var(--info)", textUnderlineOffset: "3px" },
  ".cm-gutter-lint": { width: "12px" },
  ".cm-lint-marker": { width: "8px", height: "8px", margin: "7px 2px 0" },
});

function toCm(state: EditorState, diagnostics: Diagnostic[]): CmDiagnostic[] {
  const out: CmDiagnostic[] = [];
  const doc = state.doc;
  for (const d of diagnostics) {
    if (!inBuffer(d) || d.line > doc.lines) continue;
    const line = doc.line(d.line);
    const from = Math.min(line.to, line.from + Math.max(0, d.col - 1));
    const to = Math.max(from, Math.min(line.to, line.from + Math.max(0, d.endCol - 1)));
    out.push({
      from,
      to: to === from && from < line.to ? from + 1 : to,
      severity: d.severity === "error" || d.severity === "fatal" ? "error" : d.severity === "warning" ? "warning" : "info",
      source: d.code ?? undefined,
      message: [d.message, ...d.notes].join("\n"),
    });
  }
  return out;
}

/** Common prefix and suffix of two texts, so a replacement touches only what changed. */
function minimalChange(a: string, b: string) {
  let start = 0;
  const max = Math.min(a.length, b.length);
  while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
    endA--;
    endB--;
  }
  return { from: start, to: endA, insert: b.slice(start, endB) };
}

const CodeEditor = forwardRef<EditorHandle, CodeEditorProps>(function CodeEditor(props, ref) {
  const host = useRef<HTMLDivElement | null>(null);
  const view = useRef<EditorView | null>(null);
  // Callbacks change every render; the editor reads the latest through this ref.
  const cb = useRef(props);
  cb.current = props;
  const fontSize = useRef(new Compartment());

  useEffect(() => {
    const run = () => (cb.current.onRun(), true);
    const state = EditorState.create({
      doc: props.initialValue,
      extensions: [
        Prec.highest(
          keymap.of([
            { key: "Mod-Enter", run, preventDefault: true },
            { key: "Shift-Enter", run: () => false },
            { key: "Shift-Alt-f", run: () => (cb.current.onFormat(), true), preventDefault: true },
            { key: "Mod-s", run: () => (cb.current.onSave(), true), preventDefault: true },
          ]),
        ),
        lineNumbers(),
        highlightActiveLineGutter(),
        foldGutter({ openText: "⌄", closedText: "›" }),
        lintGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ icons: true, activateOnTypingDelay: 80 }),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap, ...completionKeymap, ...lintKeymap, indentWithTab]),
        biton(),
        editorTheme,
        fontSize.current.of(EditorView.theme({ "&": { fontSize: `${props.fontSize}px` } })),
        EditorView.contentAttributes.of({ "aria-label": "Biton source code", spellcheck: "false", autocorrect: "off", autocapitalize: "off" }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cb.current.onChange(u.state.doc.toString());
          if (u.docChanged || u.transactions.length) {
            cb.current.onHistory?.({ canUndo: undoDepth(u.state) > 0, canRedo: redoDepth(u.state) > 0 });
          }
          if (u.selectionSet || u.docChanged) {
            const sel = u.state.selection.main;
            const line = u.state.doc.lineAt(sel.head);
            cb.current.onCursor?.({ line: line.number, col: sel.head - line.from + 1, selected: Math.abs(sel.to - sel.from) });
          }
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current! });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is created once; later props reach it through `cb`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    v.dispatch(setDiagnostics(v.state, props.diagnostics ? toCm(v.state, props.diagnostics) : []));
  }, [props.diagnostics]);

  useEffect(() => {
    view.current?.dispatch({ effects: fontSize.current.reconfigure(EditorView.theme({ "&": { fontSize: `${props.fontSize}px` } })) });
  }, [props.fontSize]);

  useImperativeHandle(ref, () => ({
    replaceAll(text) {
      const v = view.current;
      if (!v) return;
      const change = minimalChange(v.state.doc.toString(), text);
      if (change.from === change.to && change.insert === "") return;
      v.dispatch({ changes: change, userEvent: "input.replace" });
    },
    jumpTo(line, col) {
      const v = view.current;
      if (!v) return;
      const l = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines));
      const pos = Math.min(l.to, l.from + Math.max(0, col - 1));
      v.dispatch({ selection: EditorSelection.cursor(pos), effects: EditorView.scrollIntoView(pos, { y: "center" }) });
      v.focus();
    },
    undo: () => view.current && undo(view.current),
    redo: () => view.current && redo(view.current),
    focus: () => view.current?.focus(),
  }));

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
});

export default CodeEditor;
