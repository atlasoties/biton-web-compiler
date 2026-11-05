// Syntax highlighting for Biton, following the real lexer
// (../biton/compiler/lexer/src/Lexer.cpp): its keyword table, nestable
// /* */ comments, `@name` attributes, char literals, `"""` multi-line
// strings, and interpolated strings ("x = {x}"), whose `{...}` parts are
// highlighted as code, with nested braces tracked the way the lexer does.

// Keywords from the lexer's keyword table, minus the builtin type names
// (TYPES) and literals (LITERALS). `impl` and `closure` stay listed: the
// compiler still recognises them for diagnostics, but current code uses
// `extend` and `fn`.
export const KEYWORDS = new Set([
  "fn", "closure", "return", "const", "type", "trait", "impl", "extend", "pub",
  "if", "elif", "else", "while", "for", "loop", "break", "continue", "when",
  "defer", "try", "unsafe", "import", "from", "as", "module",
  "and", "or", "not", "xor",
  "sizeof", "alignof", "offsetof", "lengthof", "typeof",
]);
export const LITERALS = new Set(["true", "false", "null"]);
export const TYPES = new Set([
  "int", "double", "float", "bool", "char", "string", "any",
  "i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64",
]);

export type TokenClass =
  | "comment" | "string" | "escape" | "interp" | "number" | "keyword" | "literal" | "type" | "self"
  | "function" | "typeName" | "ident" | "path" | "arrow" | "attribute" | "operator" | "punct" | "space";


export interface Token {
  cls: TokenClass;
  text: string;
}

const isIdentStart = (c: string) => /[\p{L}_]/u.test(c);
const isIdent = (c: string) => /[\p{L}\p{N}\p{M}_]/u.test(c);

/**
 * Split `src` into highlighted tokens. Never throws, and the tokens'
 * texts always concatenate back to `src` exactly.
 */
export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const n = src.length;
  let i = 0;
  // One entry per open interpolation: the depth of `{` opened inside it.
  const interp: number[] = [];
  const push = (cls: TokenClass, start: number) => {
    if (i > start) out.push({ cls, text: src.slice(start, i) });
  };

  /** Lex the rest of a "..." string (begun at `start`) up to its end or a `{`. */
  const stringBody = (start: number) => {
    while (i < n) {
      const c = src[i];
      if (c === '"') {
        i++;
        push("string", start);
        return;
      }
      if (c === "\n") break; // unterminated
      if (c === "\\") {
        push("string", start);
        start = i;
        i += 2;
        if (src[start + 1] === "x") i += 2;
        else if (src[start + 1] === "u" && src[i] === "{") {
          while (i < n && src[i] !== "}" && src[i] !== "\n") i++;
          if (src[i] === "}") i++;
        }
        i = Math.min(i, n);
        push("escape", start);
        start = i;
        continue;
      }
      if (c === "{") {
        push("string", start);
        start = i;
        i++;
        push("interp", start);
        interp.push(0);
        return;
      }
      i++;
    }
    push("string", start);
  };

  while (i < n) {
    const c = src[i];
    const start = i;

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      while (i < n && /[ \t\r\n]/.test(src[i])) i++;
      push("space", start);
    } else if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      push("comment", start);
    } else if (c === "/" && src[i + 1] === "*") {
      // Block comments nest in Biton.
      let depth = 0;
      while (i < n) {
        if (src[i] === "/" && src[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (src[i] === "*" && src[i + 1] === "/") {
          depth--;
          i += 2;
          if (depth === 0) break;
        } else i++;
      }
      push("comment", start);
    } else if (c === '"' && src.startsWith('"""', i)) {
      // Multi-line string: no escapes, no interpolation.
      const end = src.indexOf('"""', i + 3);
      i = end < 0 ? n : end + 3;
      push("string", start);
    } else if (c === '"') {
      i++;
      stringBody(start);
    } else if (c === "}" && interp.length > 0 && interp[interp.length - 1] === 0) {
      // Closes an interpolated `{...}`: the string goes on.
      interp.pop();
      i++;
      push("interp", start);
      stringBody(i);
    } else if (c === "'") {
      i++;
      while (i < n && src[i] !== "'" && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      if (src[i] === "'") i++;
      i = Math.min(i, n);
      push("string", start);
    } else if (/[0-9]/.test(c)) {
      if (c === "0" && /[xXbBoO]/.test(src[i + 1] ?? "")) i += 2;
      while (i < n && /[0-9A-Fa-f_]/.test(src[i])) i++;
      if (src[i] === "." && /[0-9]/.test(src[i + 1] ?? "")) {
        i++;
        while (i < n && /[0-9_]/.test(src[i])) i++;
      }
      if (/[eE]/.test(src[i] ?? "") && /[-+0-9]/.test(src[i + 1] ?? "")) {
        i += 2;
        while (i < n && /[0-9]/.test(src[i])) i++;
      }
      while (i < n && isIdent(src[i])) i++; // suffixes
      push("number", start);
    } else if (isIdentStart(c)) {
      while (i < n && isIdent(src[i])) i++;
      const word = src.slice(start, i);
      let cls: TokenClass;
      if (KEYWORDS.has(word)) cls = "keyword";
      else if (LITERALS.has(word)) cls = "literal";
      else if (TYPES.has(word)) cls = "type";
      else if (word === "self" || word === "Self") cls = "self";
      else {
        let j = i;
        while (src[j] === " " || src[j] === "\t") j++;
        // `name(` and `name[T](` are calls or definitions; an uppercase
        // name is a type even when it is being constructed: `Point(x: 1)`.
        const generic = src[j] === "[" && /^\[[^\]\n]*\]\s*\(/.test(src.slice(j, j + 80));
        if (/^[A-Z]/.test(word)) cls = "typeName";
        else if (src[j] === "(" || generic) cls = "function";
        else cls = "ident";
      }
      push(cls, start);
    } else if (c === "@" && isIdentStart(src[i + 1] ?? "")) {
      i++;
      while (i < n && isIdent(src[i])) i++;
      push("attribute", start);
    } else if (c === "?" && src[i + 1] === "?") {
      i += 2;
      push("operator", start);
    } else if (c === "." && src[i + 1] === ".") {
      i += src[i + 2] === "=" ? 3 : 2;
      push("operator", start);
    } else if (c === ":" && src[i + 1] === ":") {
      i += 2;
      push("path", start);
    } else if (c === "-" && src[i + 1] === ">") {
      i += 2;
      push("arrow", start);
    } else if (c === ":" && src[i + 1] === "=") {
      i += 2;
      push("operator", start);
    } else {
      if (interp.length > 0) {
        if (c === "{") interp[interp.length - 1]++;
        else if (c === "}") interp[interp.length - 1]--;
      }
      // Surrogate pairs (emoji etc.) stay in one token.
      i += c.codePointAt(0)! > 0xffff ? 2 : 1;
      push(/[-+*/%=<>!&|^~?]/.test(c) ? "operator" : "punct", start);
    }
  }
  return out;
}

