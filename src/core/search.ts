/** Search index and ranking. Pure: no DOM. */

export interface SearchItem {
  kind: "lesson" | "step" | "term";
  title: string;
  sub: string;
  url: string;
  group: string;
  /** Extra searchable text (step narrative, term definition). */
  text: string;
  tags?: string[];
}

export function normalize(s: string): string {
  return s
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter(Boolean);
}

/** True when a and b differ by at most one edit (insert, delete or substitute). */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function fieldScore(queryTokens: string[], field: string, weight: number): number {
  const words = tokens(field);
  let score = 0;
  for (const q of queryTokens) {
    let best = 0;
    for (const w of words) {
      if (w === q) best = Math.max(best, 1);
      else if (w.startsWith(q)) best = Math.max(best, 0.8);
      else if (q.length >= 5 && withinOneEdit(q, w)) best = Math.max(best, 0.5);
    }
    if (best === 0) return 0;
    score += best;
  }
  return score * weight;
}

export function search(items: readonly SearchItem[], query: string, limit = 12): SearchItem[] {
  const q = tokens(query);
  if (q.length === 0) return items.filter((i) => i.kind === "lesson").slice(0, limit);
  const scored: [SearchItem, number][] = [];
  for (const item of items) {
    const s =
      fieldScore(q, item.title, 10) +
      fieldScore(q, (item.tags ?? []).join(" "), 5) +
      fieldScore(q, item.sub, 4) +
      fieldScore(q, item.text, 1);
    if (s > 0) scored.push([item, s + (item.kind === "lesson" ? 0.5 : 0)]);
  }
  return scored
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([i]) => i);
}
