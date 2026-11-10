/**
 * Post-build checks on dist/: size budgets, broken internal links,
 * a CSP on every page whose script hashes match the inline scripts, no style="" attributes
 * and no third-party resources.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = resolve(import.meta.dirname, "..", "dist");
const BASE = (() => {
  const b = process.env.BASE_URL ?? "/";
  return `${b.startsWith("/") ? "" : "/"}${b}${b.endsWith("/") ? "" : "/"}`;
})();
const KB = 1024;
const BUDGET = {
  entryJs: 120 * KB,
  lessonJs: 40 * KB,
  css: 30 * KB,
  lessonHtml: 60 * KB,
  total: 25 * KB * KB,
};
const SITES = ["redes", "so", "arq"];

const errors: string[] = [];
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const all = walk(DIST);
const gz = (file: string) => gzipSync(readFileSync(file)).length;
const kb = (n: number) => `${(n / KB).toFixed(1)} KB`;
const rel = (f: string) => relative(DIST, f).replaceAll("\\", "/");

const total = all.reduce((n, f) => n + statSync(f).size, 0);
if (total > BUDGET.total) errors.push(`dist/ tem ${kb(total)} (máx. ${kb(BUDGET.total)})`);

/** Resolve an absolute URL path to a dist file, or null when it does not exist. */
function target(urlPath: string): string | null {
  if (!urlPath.startsWith(BASE)) return null;
  const p = decodeURIComponent(urlPath.slice(BASE.length).split(/[?#]/)[0] ?? "");
  const file = join(DIST, p);
  if (p === "" || p.endsWith("/"))
    return existsSync(join(file, "index.html")) ? join(file, "index.html") : null;
  return existsSync(file) ? file : null;
}

for (const file of all.filter((f) => f.endsWith(".html"))) {
  const name = rel(file);
  const text = readFileSync(file, "utf8");
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/
    .exec(text)?.[1]
    ?.replaceAll("&#39;", "'");
  if (!csp) errors.push(`${name}: sem CSP`);
  else {
    for (const m of text.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
      const h = `'sha256-${createHash("sha256")
        .update(m[1] as string)
        .digest("base64")}'`;
      if (!csp.includes(h)) errors.push(`${name}: script inline sem hash na CSP (${h})`);
    }
    if (/unsafe-inline|unsafe-eval/.test(csp)) errors.push(`${name}: CSP com unsafe-*`);
  }
  if (/\sstyle="/.test(text)) errors.push(`${name}: atributo style="" (bloqueado pela CSP)`);
  for (const m of text.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(https?:)?\/\/[^"]+"/g))
    if (!m[0].includes('rel="canonical"')) errors.push(`${name}: recurso externo ${m[0]}`);
  for (const m of text.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = m[1] as string;
    if (/^(https?:|mailto:|#|data:)/.test(url)) continue;
    if (!url.startsWith("/")) {
      errors.push(`${name}: link relativo ${url} (use caminhos a partir da base)`);
      continue;
    }
    if (!target(url)) errors.push(`${name}: link quebrado ${url}`);
  }
  if (/^(redes|so|arq)\/[a-z0-9-]+\/index\.html$/.test(name) && statSync(file).size > BUDGET.lessonHtml)
    errors.push(`${name}: ${kb(statSync(file).size)} (máx. ${kb(BUDGET.lessonHtml)})`);
}

// entry JS per site: the module script of the site page plus its modulepreloads
for (const site of SITES) {
  const page = join(DIST, site, "index.html");
  if (!existsSync(page)) {
    errors.push(`${site}/index.html não existe`);
    continue;
  }
  const html = readFileSync(page, "utf8");
  const js = [
    ...html.matchAll(/<(?:script type="module"[^>]*src|link rel="modulepreload"[^>]*href)="([^"]+)"/g),
  ]
    .map((m) => target(m[1] as string))
    .filter((f): f is string => !!f);
  const jsSize = js.reduce((n, f) => n + gz(f), 0);
  if (jsSize > BUDGET.entryJs)
    errors.push(`${site}: JS de entrada ${kb(jsSize)} gzip (máx. ${kb(BUDGET.entryJs)})`);
  const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)]
    .map((m) => target(m[1] as string))
    .filter((f): f is string => !!f);
  const cssSize = css.reduce((n, f) => n + gz(f), 0);
  if (cssSize > BUDGET.css) errors.push(`${site}: CSS ${kb(cssSize)} gzip (máx. ${kb(BUDGET.css)})`);
  console.log(`${site}: JS de entrada ${kb(jsSize)}, CSS ${kb(cssSize)} (gzip)`);
}

// lesson chunks: named after the lesson file by Rollup
const lessonNames = SITES.flatMap((s) =>
  existsSync(join(resolve(DIST, "..", "src/sites", s, "lessons")))
    ? readdirSync(resolve(DIST, "..", "src/sites", s, "lessons"))
    : [],
)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => f.slice(0, -3));
for (const f of all.filter((x) => /assets\/[^/]+\.js$/.test(rel(x)))) {
  const base = rel(f)
    .replace(/^assets\//, "")
    .replace(/-[A-Za-z0-9_-]{8}\.js$/, "");
  if (lessonNames.includes(base) && gz(f) > BUDGET.lessonJs)
    errors.push(`${rel(f)}: ${kb(gz(f))} gzip (máx. ${kb(BUDGET.lessonJs)})`);
}

for (const must of [
  "index.html",
  "404.html",
  "sitemap.xml",
  "robots.txt",
  "sw.js",
  ...SITES.map((s) => `${s}/search.json`),
  ...SITES.map((s) => `${s}/offline.json`),
])
  if (!existsSync(join(DIST, must))) errors.push(`falta dist/${must}`);

if (errors.length) {
  console.error(`check-dist: ${errors.length} problema(s)\n${errors.join("\n")}`);
  process.exit(1);
}
console.log(`check-dist: ok (${all.length} arquivos, ${kb(total)})`);
