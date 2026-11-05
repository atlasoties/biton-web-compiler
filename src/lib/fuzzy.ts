// Fuzzy matching for quick open: the query's characters must appear in order
// in the path. Matches in the file name, at word starts and in runs score
// higher, so "geo" finds "src/util/geo.bit" before "src/geography/x.bit".

export interface FuzzyMatch {
  score: number;
  /** Indices into the path of the matched characters, for highlighting. */
  indices: number[];
}

const isBoundary = (path: string, i: number) => i === 0 || "/._-".includes(path[i - 1]) || (/[a-z]/.test(path[i - 1]) && /[A-Z]/.test(path[i]));

export function fuzzyMatch(query: string, path: string): FuzzyMatch | null {
  const q = query.replace(/\s+/g, "").toLowerCase();
  if (!q) return { score: 0, indices: [] };
  const lower = path.toLowerCase();
  const nameStart = path.lastIndexOf("/") + 1;

  // Prefer matching inside the file name: try from the name first, then the whole path.
  const attempt = (from: number): FuzzyMatch | null => {
    const indices: number[] = [];
    let score = 0;
    let prev = -2;
    let j = from;
    for (const ch of q) {
      // Look ahead for a boundary match before settling for any match.
      let found = -1;
      for (let k = j; k < lower.length; k++) {
        if (lower[k] !== ch) continue;
        if (found === -1) found = k;
        if (isBoundary(path, k) || k === prev + 1) {
          found = k;
          break;
        }
      }
      if (found === -1) return null;
      score += 1;
      if (found === prev + 1) score += 5;
      if (isBoundary(path, found)) score += 3;
      if (found >= nameStart) score += 2;
      indices.push(found);
      prev = found;
      j = found + 1;
    }
    // Shorter paths and earlier matches win ties.
    score -= path.length * 0.01 + indices[0] * 0.01;
    if (lower.slice(nameStart).startsWith(q)) score += 10;
    return { score, indices };
  };

  const inName = attempt(nameStart);
  const anywhere = attempt(0);
  if (!inName) return anywhere;
  if (!anywhere) return inName;
  return inName.score >= anywhere.score ? inName : anywhere;
}

/** Paths matching `query`, best first. */
export function fuzzyFilter(query: string, paths: string[], limit = 50): Array<{ path: string } & FuzzyMatch> {
  const out: Array<{ path: string } & FuzzyMatch> = [];
  for (const path of paths) {
    const m = fuzzyMatch(query, path);
    if (m) out.push({ path, ...m });
  }
  out.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return out.slice(0, limit);
}
