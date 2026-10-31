// Syntax highlighting for Biton, following the real lexer
// (../biton/lib/lexer/src/Lexer.cpp): its keyword table, nestable
// /* */ comments, `~>` attributes, char literals and hex/binary numbers.

import React from "react";

const KEYWORDS = new Set([
  "def", "fix", "fn", "give", "if", "elif", "else", "while", "for", "loop",
  "exit", "break", "redo", "continue", "when", "import", "from", "pub", "pri",
  "kind", "enum", "union", "impl", "defer", "unsafe", "ref", "as", "module",
  "sizeof", "alignof", "typeof", "lengthof", "offsetof",
  "and", "or", "not", "xor",
]);
const LITERALS = new Set(["true", "false", "null"]);
const TYPES = new Set([
  "int", "double", "float", "bool", "char", "string", "any",
  "i8", "i16", "i32", "i64", "u8", "u16", "u32", "u64",
]);

export type TokenClass =
  | "comment" | "string" | "number" | "keyword" | "literal" | "type" | "self"
  | "function" | "typeName" | "ident" | "path" | "arrow" | "attribute" | "punct" | "space";

const CLASS_STYLES: Record<TokenClass, string> = {
  comment: "text-[#7d6f60] italic",
  string: "text-[#fcd389]",
  number: "text-[#ffa500]",
  keyword: "text-[#fec153] font-semibold",
  literal: "text-[#ffa500] font-semibold",
  type: "text-emerald-400",
  self: "text-pink-300 italic",
  function: "text-[#fdcc74]",
  typeName: "text-sky-300",
  ident: "text-zinc-100",
  path: "text-[#38bdf8] font-bold",
  arrow: "text-[#f472b6]",
  attribute: "text-[#a78bfa]",
  punct: "text-[#fcd389]/60",
  space: "",
};

interface Token {
  cls: TokenClass;
  text: string;
}

const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdent = (c: string) => /[A-Za-z0-9_]/.test(c);

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = src.length;
  const push = (cls: TokenClass, start: number) => out.push({ cls, text: src.slice(start, i) });

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
        if (src[i] === "/" && src[i + 1] === "*") { depth++; i += 2; }
        else if (src[i] === "*" && src[i + 1] === "/") { depth--; i += 2; if (depth === 0) break; }
        else i++;
      }
      push("comment", start);
    } else if (c === '"' || c === "'") {
      i++;
      while (i < n && src[i] !== c && src[i] !== "\n") i += src[i] === "\\" ? 2 : 1;
      if (src[i] === c) i++;
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
      while (i < n && isIdent(src[i])) i++; // suffixes such as 1.5f
      push("number", start);
    } else if (isIdentStart(c)) {
      while (i < n && isIdent(src[i])) i++;
      const word = src.slice(start, i);
      let cls: TokenClass;
      if (KEYWORDS.has(word)) cls = "keyword";
      else if (LITERALS.has(word)) cls = "literal";
      else if (TYPES.has(word)) cls = "type";
      else if (word === "self") cls = "self";
      else {
        let j = i;
        while (src[j] === " " || src[j] === "\t") j++;
        // `name(` and `name<T>(` / `name[T](` are calls or definitions.
        if (src[j] === "(") cls = "function";
        else if (/^[A-Z]/.test(word)) cls = "typeName";
        else cls = "ident";
      }
      out.push({ cls, text: word });
    } else if (c === "~" && src[i + 1] === ">") {
      i += 2;
      while (i < n && isIdent(src[i])) i++;
      push("attribute", start);
    } else if (c === ":" && src[i + 1] === ":") {
      i += 2;
      push("path", start);
    } else if ((c === "=" || c === "-") && src[i + 1] === ">") {
      i += 2;
      push("arrow", start);
    } else {
      i++;
      push("punct", start);
    }
  }
  return out;
}

/**
 * Highlight `src` as one React node per line, so the overlay lines up with
 * the textarea. `markedLines` get a background (1-based line numbers).
 */
export function highlight(src: string, markedLines: Map<number, "error" | "warning"> = new Map()): React.ReactNode {
  const lines: React.ReactNode[][] = [[]];
  let key = 0;
  for (const tok of tokenize(src)) {
    const parts = tok.text.split("\n");
    parts.forEach((part, idx) => {
      if (idx > 0) lines.push([]);
      if (part) {
        lines[lines.length - 1].push(
          <span key={key++} className={CLASS_STYLES[tok.cls]}>
            {part}
          </span>,
        );
      }
    });
  }
  return lines.map((els, idx) => {
    const mark = markedLines.get(idx + 1);
    const bg = mark === "error" ? "bg-red-500/10" : mark === "warning" ? "bg-amber-400/10" : "";
    return (
      <div key={idx} className={`min-h-6 ${bg}`}>
        {els.length > 0 ? els : " "}
      </div>
    );
  });
}
