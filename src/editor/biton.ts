// Biton for CodeMirror 6: highlighting, indentation, folding, comments and
// autocompletion. The tokenizer follows the real lexer
// (../biton/compiler/lexer/src/Lexer.cpp) like src/lib/tokenize.ts does, but
// incrementally, line by line, carrying its state (open interpolations,
// block-comment depth, multi-line strings) from one line to the next.

import {
  HighlightStyle,
  LanguageSupport,
  StreamLanguage,
  foldService,
  indentService,
  indentUnit,
  matchBrackets,
  syntaxHighlighting,
  type StringStream,
} from "@codemirror/language";
import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";

import { KEYWORDS, LITERALS, TYPES } from "../lib/tokenize.ts";
import { STDLIB_EXPORTS } from "../reference.ts";

const CONTROL = new Set(["if", "elif", "else", "while", "for", "loop", "break", "continue", "return", "when", "defer", "unsafe"]);
const OPERATOR_WORDS = new Set(["and", "or", "not", "xor", "as", "try"]);
const DEFINITION = new Set(["fn", "type", "trait", "impl", "extend", "const", "closure", "pub", "import", "from", "module"]);
/** Modules named after a `.`: `std`, `math`, `vec`, ... */
const NAMESPACES = new Set(["std", ...Object.keys(STDLIB_EXPORTS)]);

interface State {
  /** One entry per open `{...}` interpolation: braces opened inside it. */
  interp: number[];
  /** Inside a "..." string (resumed after an interpolation). */
  inString: boolean;
  /** Inside a `"""` string. */
  inRaw: boolean;
  /** Nesting depth of an open block comment. */
  comment: number;
}

function blockComment(stream: StringStream, state: State): string {
  while (!stream.eol()) {
    if (stream.match("/*")) state.comment++;
    else if (stream.match("*/")) {
      state.comment--;
      if (state.comment === 0) break;
    } else stream.next();
  }
  return "comment";
}

function stringBody(stream: StringStream, state: State): string {
  const start = stream.pos;
  while (!stream.eol()) {
    const c = stream.peek()!;
    if (c === '"') {
      stream.next();
      state.inString = false;
      return "string";
    }
    if (c === "\\") {
      if (stream.pos > start) return "string";
      stream.next();
      if (stream.eat("x")) stream.match(/^[0-9A-Fa-f]{0,2}/);
      else if (stream.eat("u")) stream.match(/^\{[0-9A-Fa-f]*\}?/);
      else stream.next();
      return "escape";
    }
    if (c === "{") {
      if (stream.pos > start) return "string";
      stream.next();
      state.inString = false;
      state.interp.push(0);
      return "interp";
    }
    stream.next();
  }
  state.inString = false; // a string does not continue on the next line
  return "string";
}

const bitonStream = StreamLanguage.define<State>({
  name: "biton",
  startState: () => ({ interp: [], inString: false, inRaw: false, comment: 0 }),
  copyState: (s) => ({ ...s, interp: [...s.interp] }),

  token(stream, state) {
    if (state.comment > 0) return blockComment(stream, state);
    if (state.inRaw) {
      if (stream.skipTo('"""')) {
        stream.match('"""');
        state.inRaw = false;
      } else stream.skipToEnd();
      return "string";
    }
    if (state.inString) return stringBody(stream, state);
    if (stream.eatSpace()) return null;

    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (stream.match("/*")) {
      state.comment = 1;
      return blockComment(stream, state);
    }
    if (stream.match('"""')) {
      state.inRaw = true;
      if (stream.skipTo('"""')) {
        stream.match('"""');
        state.inRaw = false;
      } else stream.skipToEnd();
      return "string";
    }
    if (stream.eat('"')) {
      state.inString = true;
      return stringBody(stream, state);
    }
    const ch = stream.peek()!;
    if (ch === "}" && state.interp.length > 0 && state.interp[state.interp.length - 1] === 0) {
      stream.next();
      state.interp.pop();
      state.inString = true;
      return "interp";
    }
    if (stream.match(/^'(?:\\(?:x[0-9A-Fa-f]{2}|u\{[0-9A-Fa-f]+\}|.)|[^'\\])'/)) return "string";
    if (stream.match(/^0[xX][0-9A-Fa-f_]+|^0[bB][01_]+|^0[oO][0-7_]+/) || stream.match(/^\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][-+]?\d+)?/)) {
      stream.match(/^[A-Za-z_]\w*/); // suffix
      return "number";
    }
    if (stream.match(/^[\p{L}_][\p{L}\p{N}\p{M}_]*/u)) {
      const w = stream.current();
      if (LITERALS.has(w)) return w === "null" ? "null" : "bool";
      if (CONTROL.has(w)) return "controlKeyword";
      if (OPERATOR_WORDS.has(w)) return "operatorKeyword";
      if (DEFINITION.has(w)) return "definitionKeyword";
      if (KEYWORDS.has(w)) return "keyword";
      if (TYPES.has(w)) return "builtinType";
      if (w === "self" || w === "Self") return "self";
      const qualified = stream.match(/^\s*(?:\.|::)/, false);
      if (qualified && (NAMESPACES.has(w) || /^[A-Z]/.test(w))) {
        return /^[A-Z]/.test(w) ? "typeName" : "namespace";
      }
      const call = stream.match(/^\s*(?:\[[^\]\n]*\]\s*)?\(/, false);
      if (/^[A-Z]/.test(w)) return "typeName";
      if (call) return "function";
      return "variable";
    }
    if (stream.match(/^@[\p{L}_][\p{L}\p{N}_]*/u)) return "attr";
    if (stream.match("::")) return "separator";
    if (stream.match("->")) return "arrow";
    if (stream.match(/^(?::=|<<=|>>=|[-+*/%&|^]=|==|!=|<=|>=|<<|>>|\?\?|\.\.=|\.\.|[-+*/%=<>!&|^~?])/)) return "operator";
    stream.next();
    if (state.interp.length > 0) {
      if (ch === "{") state.interp[state.interp.length - 1]++;
      else if (ch === "}") state.interp[state.interp.length - 1]--;
    }
    return /[()[\]{}]/.test(ch) ? "bracket" : "punctuation";
  },

  tokenTable: {
    controlKeyword: t.controlKeyword,
    operatorKeyword: t.operatorKeyword,
    definitionKeyword: t.definitionKeyword,
    keyword: t.keyword,
    builtinType: t.standard(t.typeName),
    typeName: t.typeName,
    namespace: t.namespace,
    function: t.function(t.variableName),
    variable: t.variableName,
    self: t.self,
    bool: t.bool,
    null: t.null,
    string: t.string,
    escape: t.escape,
    interp: t.special(t.brace),
    number: t.number,
    comment: t.comment,
    attr: t.meta,
    separator: t.separator,
    arrow: t.operator,
    operator: t.operator,
    bracket: t.bracket,
    punctuation: t.punctuation,
  },

  languageData: {
    commentTokens: { line: "//", block: { open: "/*", close: "*/" } },
    closeBrackets: { brackets: ["(", "[", "{", '"', "'"] },
    indentOnInput: /^\s*[}\])]$/,
    wordChars: "_",
  },
});

/** Colours come from the theme's CSS variables, so one style serves both themes. */
export const bitonHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.definitionKeyword, t.controlKeyword, t.operatorKeyword], color: "var(--syn-keyword)", fontWeight: "500" },
  { tag: t.standard(t.typeName), color: "var(--syn-type)" },
  { tag: t.typeName, color: "var(--syn-type-name)" },
  { tag: t.namespace, color: "var(--syn-path)" },
  { tag: t.function(t.variableName), color: "var(--syn-function)" },
  { tag: t.variableName, color: "var(--syn-ident)" },
  { tag: t.self, color: "var(--syn-self)", fontStyle: "italic" },
  { tag: [t.bool, t.null], color: "var(--syn-literal)", fontWeight: "500" },
  { tag: t.string, color: "var(--syn-string)" },
  { tag: t.escape, color: "var(--syn-escape)" },
  { tag: t.special(t.brace), color: "var(--syn-interp)", fontWeight: "600" },
  { tag: t.number, color: "var(--syn-number)" },
  { tag: t.comment, color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: t.meta, color: "var(--syn-attribute)" },
  { tag: [t.operator, t.separator], color: "var(--syn-operator)" },
  { tag: [t.bracket, t.punctuation], color: "var(--syn-punct)" },
]);

// ── indentation and folding ─────────────────────────────────────────────

const OPENS = /[{([]\s*(?:\/\/.*)?$/;

const bitonIndent = indentService.of((cx, pos) => {
  // The line above `pos`, seen through any simulated line break (Enter
  // splitting a line asks for the indentation of the part after it).
  let prev = cx.lineAt(pos, -1);
  if (prev.from >= pos) {
    if (pos === 0) return 0;
    prev = cx.lineAt(pos - 1, -1);
  }
  while (prev.text.trim() === "" && prev.from > 0) prev = cx.lineAt(prev.from - 1, -1);
  const unit = cx.unit;
  let indent = /^\s*/.exec(prev.text)![0].replace(/\t/g, " ".repeat(unit)).length;
  if (OPENS.test(prev.text)) indent += unit;
  if (/^\s*[}\])]/.test(cx.textAfterPos(pos))) indent -= unit;
  return Math.max(0, indent);
});

/** Fold from a line ending in `{` to its matching `}`. */
const bitonFold = foldService.of((state, from, to) => {
  const text = state.sliceDoc(from, to);
  const m = /\{\s*(?:\/\/.*)?$/.exec(text);
  if (!m) return null;
  const open = from + m.index;
  const match = matchBrackets(state, open, 1);
  if (!match?.matched || !match.end) return null;
  const close = match.end.from;
  if (state.doc.lineAt(close).number === state.doc.lineAt(from).number) return null;
  return { from: open + 1, to: close };
});

// ── completion ──────────────────────────────────────────────────────────

const SNIPPETS: Completion[] = [
  snippetCompletion("fn ${name}(${}) ${int} {\n\t${}\n}", { label: "fn", detail: "function", type: "keyword" }),
  snippetCompletion("fn main() int {\n\t${}\n\treturn 0\n}", { label: "main", detail: "fn main() int", type: "keyword" }),
  snippetCompletion("if ${cond} {\n\t${}\n}", { label: "if", detail: "block", type: "keyword" }),
  snippetCompletion("for ${i} in 0..${n} {\n\t${}\n}", { label: "for", detail: "range loop", type: "keyword" }),
  snippetCompletion("for ${x} in ${xs} {\n\t${}\n}", { label: "for in", detail: "collection loop", type: "keyword" }),
  snippetCompletion("for ${i}, ${x} in ${xs} {\n\t${}\n}", { label: "for index", detail: "index and element", type: "keyword" }),
  snippetCompletion("while ${cond} {\n\t${}\n}", { label: "while", detail: "loop", type: "keyword" }),
  snippetCompletion("when ${value} {\n\t${pattern} -> ${}\n\telse -> ${}\n}", { label: "when", detail: "match", type: "keyword" }),
  snippetCompletion("type ${Name} {\n\t${field}: ${int}\n}", { label: "type", detail: "struct", type: "keyword" }),
  snippetCompletion("extend ${Type} {\n\tfn ${name}(self) {\n\t\t${}\n\t}\n}", { label: "extend", detail: "methods", type: "keyword" }),
  snippetCompletion("extend ${Type}: Show {\n\tfn show(out: *Text) { out.append(\"${}\") }\n}", { label: "extend Show", detail: "printable", type: "keyword" }),
  snippetCompletion("trait ${Name} {\n\tfn ${method}() ${int}\n}", { label: "trait", detail: "trait", type: "keyword" }),
  snippetCompletion('print("${}")', { label: "print", detail: "(value, end: \"\\n\", err: false)", type: "function", boost: 2 }),
];

const PRELUDE: Completion[] = [
  ...["some_or", "ok_or", "flush", "sizeof", "alignof", "lengthof"].map((label) => ({ label, type: "function" })),
  ...["Option", "Result", "Text", "Show", "Ord", "Eq", "Hash", "error"].map((label) => ({ label, type: "type" })),
  ...["Option.Some", "Option.None", "Result.Ok", "Result.Err"].map((label) => ({ label, type: "enum" })),
];

const WORDS: Completion[] = [
  ...[...KEYWORDS].map((label) => ({ label, type: "keyword" })),
  ...[...TYPES].map((label) => ({ label, type: "type" })),
  ...[...LITERALS].map((label) => ({ label, type: "constant" })),
  { label: "self", type: "variable" },
  { label: "Self", type: "type" },
];

/** Public names per standard library module (kept in sync with ../biton/stdlib by a test). */
const MODULE_NAMES: Record<string, Completion[]> = Object.fromEntries(
  Object.entries(STDLIB_EXPORTS).map(([mod, names]) => [
    mod,
    names.map((label) => ({ label, type: /^[A-Z][a-z]/.test(label) ? "type" : /^[A-Z_]+$/.test(label) ? "constant" : "function" })),
  ]),
);
const MODULES: Completion[] = Object.keys(MODULE_NAMES).map((label) => ({ label, type: "namespace" }));

/** Identifiers already in the document. */
function documentWords(context: CompletionContext, exclude: string): Completion[] {
  const seen = new Set<string>();
  const text = context.state.doc.sliceString(0, Math.min(context.state.doc.length, 200_000));
  for (const m of text.matchAll(/[\p{L}_][\p{L}\p{N}_]{2,}/gu)) {
    if (m[0] !== exclude) seen.add(m[0]);
  }
  for (const w of [...KEYWORDS, ...TYPES, ...LITERALS]) seen.delete(w);
  return [...seen].map((label) => ({ label, type: "text", boost: -1 }));
}

function bitonCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  if (/\/\/|^[^"]*"(?:[^"\\]|\\.)*$/.test(before) && !/\{[^}]*$/.test(before)) return null; // comment / string

  // import std.<module>  and  import std.<module>.{<names>}
  const mod = /\bimport\s+std\.([a-z_]*)$/.exec(before);
  if (mod) return { from: context.pos - mod[1].length, options: MODULES, validFor: /^[a-z_]*$/ };
  const names = /\bimport\s+std\.([a-z_]+)\.\{(?:[^}]*,\s*)?([A-Za-z_]*)$/.exec(before);
  if (names) return { from: context.pos - names[2].length, options: MODULE_NAMES[names[1]] ?? [], validFor: /^\w*$/ };

  const word = context.matchBefore(/[\p{L}_][\p{L}\p{N}_]*/u);
  if (!word || (word.from === word.to && !context.explicit)) return null;
  if (line.text[word.from - line.from - 1] === ".") return null; // methods: not known without types
  return {
    from: word.from,
    options: [...SNIPPETS, ...PRELUDE, ...WORDS, ...documentWords(context, word.text)],
    validFor: /^[\p{L}\p{N}_]*$/u,
  };
}

export function biton(): LanguageSupport {
  return new LanguageSupport(bitonStream, [
    syntaxHighlighting(bitonHighlight),
    bitonIndent,
    bitonFold,
    indentUnit.of("    "),
    bitonStream.data.of({ autocomplete: bitonCompletions }),
  ]);
}
