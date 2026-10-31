// Parse the diagnostics `biton --no-color` prints to stderr.
//
// The format comes from DiagnosticsEngine::render_one in the biton repo
// (lib/exceptions/src/Diagnostic.cpp):
//
//   error[E0200]: undefined identifier 'nope'
//    --> main.bit:5:13
//      |
//    5 |     def y = nope + 1;
//      |             ^^^^ optional label
//    = note: ...
//    = help: ...
//   <blank line>
//
// followed at the end by "error: aborting due to N errors".

import type { Diagnostic, Severity } from "../shared/api.ts";

const HEADER = /^(error|warning|note|help|fatal)\[([A-Z0-9?]+)\]: (.*)$/;
const LOCATION = /^\s*--> (.*):(\d+):(\d+)$/;
const SOURCE_ROW = /^\s*\d+ \| /;
const CARET_ROW = /^\s*\| ( *)(\^+)(?: (.*))?$/;
const TRAILER = /^\s*= (note|help): (.*)$/;
const SUMMARY = /^(error|fatal): aborting due to /;
const SUPPRESSED = /^note: \d+ further diagnostic/;

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;

export interface ParsedOutput {
  diagnostics: Diagnostic[];
  /** Lines that were not part of any diagnostic (linker output, crashes...). */
  other: string;
}

export function parseDiagnostics(stderr: string): ParsedOutput {
  const lines = stderr.replace(ANSI, "").split("\n");
  const diagnostics: Diagnostic[] = [];
  const other: string[] = [];
  let cur: Diagnostic | null = null;
  let renderedLines: string[] = [];
  let sawPrimaryCaret = false;

  const finish = () => {
    if (cur) {
      cur.rendered = renderedLines.join("\n").trimEnd();
      diagnostics.push(cur);
    }
    cur = null;
    renderedLines = [];
    sawPrimaryCaret = false;
  };

  for (const line of lines) {
    const header = HEADER.exec(line);
    if (header) {
      finish();
      cur = {
        severity: header[1] as Severity,
        code: header[2].includes("?") ? null : header[2],
        message: header[3],
        file: null,
        line: 0,
        col: 0,
        endCol: 0,
        notes: [],
        rendered: "",
      };
      renderedLines.push(line);
      continue;
    }

    if (!cur) {
      if (line.trim() && !SUMMARY.test(line) && !SUPPRESSED.test(line)) other.push(line);
      continue;
    }

    if (line.trim() === "") {
      // A blank line ends the diagnostic (the gutter separator always has a `|`).
      finish();
      continue;
    }

    renderedLines.push(line);

    const loc = LOCATION.exec(line);
    if (loc && cur.line === 0) {
      cur.file = loc[1];
      cur.line = Number(loc[2]);
      cur.col = Number(loc[3]);
      cur.endCol = cur.col + 1;
      continue;
    }

    const caret = CARET_ROW.exec(line);
    if (caret) {
      if (!sawPrimaryCaret) {
        // First caret row underlines the primary span on `cur.line`.
        sawPrimaryCaret = true;
        cur.endCol = caret[1].length + 1 + caret[2].length;
      } else if (caret[3]) {
        cur.notes.push(caret[3]);
      }
      continue;
    }

    const trailer = TRAILER.exec(line);
    if (trailer) {
      cur.notes.push(`${trailer[1]}: ${trailer[2]}`);
      continue;
    }

    if (SOURCE_ROW.test(line)) continue;
  }
  finish();

  return { diagnostics, other: other.join("\n") };
}
