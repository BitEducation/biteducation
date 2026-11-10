import { readString, writeString } from "./storage.ts";

export type Locale = "pt-BR" | "en";
export const LOCALES: { code: Locale; name: string; short: string }[] = [
  { code: "pt-BR", name: "Português (Brasil)", short: "PT" },
  { code: "en", name: "English (interface only)", short: "EN" },
];

type Dict = Record<string, string>;

const KEY = "biteducation:lang";
let current: Locale = "pt-BR";
let source: Dict = {};
const loaded: Partial<Record<Locale, Dict>> = {};

export function setSourceStrings(dict: Dict): void {
  source = dict;
}

/**
 * Lesson content exists only in pt-BR, so the browser language is ignored: an English
 * interface around Portuguese text reads as broken. English is an explicit choice.
 */
export function detectLocale(): Locale {
  return readString(KEY) === "en" ? "en" : "pt-BR";
}

export function locale(): Locale {
  return current;
}

export async function setLocale(
  code: Locale,
  load: (code: Locale) => Promise<Dict>,
  persist = true,
): Promise<void> {
  if (code !== "pt-BR" && !loaded[code]) loaded[code] = await load(code);
  current = code;
  if (persist) writeString(KEY, code);
  // The page language stays pt-BR: it is what screen readers need to pronounce the content.
  if (typeof document !== "undefined") document.documentElement.dataset.ui = code;
}

/** Translate a UI key, with {name} interpolation. Falls back to the pt-BR source, then to the key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = current === "pt-BR" ? source : (loaded[current] ?? {});
  let s = dict[key] ?? source[key] ?? key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}
