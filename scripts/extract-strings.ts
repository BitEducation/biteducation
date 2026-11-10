/**
 * Mirrors the keys of src/ui/strings.ts into src/locales/en/ui.json: keeps existing
 * translations, drops keys that no longer exist and lists the ones still missing
 * (the UI falls back to pt-BR for those). `--check` exits 1 when anything is missing
 * or obsolete, without writing.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { UI } from "../src/ui/strings.ts";

const FILE = resolve(import.meta.dirname, "..", "src/locales/en/ui.json");
const check = process.argv.includes("--check");
const current = JSON.parse(readFileSync(FILE, "utf8")) as Record<string, string>;
const keys = Object.keys(UI);
const obsolete = Object.keys(current).filter((k) => !(k in UI));
const missing = keys.filter((k) => !current[k]?.trim());

// placeholders like {n} must survive translation
const ph = (s: string) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(",");
const broken = keys.filter((k) => current[k] && ph(current[k]) !== ph(UI[k as keyof typeof UI]));

for (const k of obsolete) console.log(`obsoleta: ${k}`);
for (const k of missing) console.log(`sem tradução: ${k}`);
for (const k of broken) console.log(`placeholders diferentes: ${k}`);

if (check) {
  if (obsolete.length || missing.length || broken.length) process.exit(1);
  console.log(`strings: ok (${keys.length} chaves)`);
} else {
  const next = Object.fromEntries(keys.filter((k) => current[k]).map((k) => [k, current[k]]));
  writeFileSync(FILE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `strings: ${keys.length - missing.length}/${keys.length} traduzidas, ${obsolete.length} removidas`,
  );
}
