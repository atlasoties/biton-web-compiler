// Program arguments typed as one line, split the way a shell would for
// the common cases: whitespace separates, '...' and "..." group (with \"
// and \\ inside double quotes), and a backslash outside quotes escapes the
// next character. No variables, globs or other expansion.

export function parseArgs(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inArg = false;
  let quote: "'" | '"' | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else cur += c;
    } else if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === "\\" && (line[i + 1] === '"' || line[i + 1] === "\\")) cur += line[++i];
      else cur += c;
    } else if (c === "'" || c === '"') {
      quote = c;
      inArg = true;
    } else if (c === "\\" && i + 1 < line.length) {
      cur += line[++i];
      inArg = true;
    } else if (/\s/.test(c)) {
      if (inArg) out.push(cur);
      cur = "";
      inArg = false;
    } else {
      cur += c;
      inArg = true;
    }
  }
  if (inArg) out.push(cur);
  return out;
}

/** The inverse of parseArgs: one line that parses back to `args`. */
export function formatArgs(args: string[]): string {
  return args.map((a) => (a !== "" && /^[A-Za-z0-9_@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'"'"'`)}'`)).join(" ");
}
