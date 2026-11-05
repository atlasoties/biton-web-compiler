// Renders a Biton snippet highlighted, one element per line (see tokenize.ts).
// Used outside the editor (the reference panel); colours come from the
// theme's .syn-* classes in index.css.

import React from "react";

import { tokenize } from "./tokenize.ts";

export function highlight(src: string): React.ReactNode {
  const lines: React.ReactNode[][] = [[]];
  let key = 0;
  for (const tok of tokenize(src)) {
    const parts = tok.text.split("\n");
    parts.forEach((part, idx) => {
      if (idx > 0) lines.push([]);
      if (part) {
        lines[lines.length - 1].push(
          tok.cls === "space" ? (
            part
          ) : (
            <span key={key++} className={`syn-${tok.cls}`}>
              {part}
            </span>
          ),
        );
      }
    });
  }
  return lines.map((els, idx) => <div key={idx}>{els.length > 0 ? els : " "}</div>);
}
