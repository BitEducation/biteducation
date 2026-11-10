type Dict = Record<string, string>;

let source: Dict = {};

export function setSourceStrings(dict: Dict): void {
  source = dict;
}

/** Look up a UI key, with {name} interpolation. Falls back to the key itself. */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = source[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}
