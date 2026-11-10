/**
 * Writes dist/sw.js (src/sw.ts transpiled, with its precache list) and one
 * dist/<site>/offline.json per site: the pages and lesson chunks that the "download this site"
 * button stores. Runs after prerender, so it sees the final set of pages.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { transformWithEsbuild } from "vite";
import { SITES } from "./lib/sites.ts";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const BASE = (() => {
  const b = process.env.BASE_URL ?? "/";
  return `${b.startsWith("/") ? "" : "/"}${b}${b.endsWith("/") ? "" : "/"}`;
})();

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const rel = (f: string) => relative(DIST, f).replaceAll("\\", "/");
const url = (p: string) => `${BASE}${p}`;

const files = walk(DIST).map(rel);
const lessonSlugs = new Set(
  SITES.flatMap(({ catalog }) => {
    const dir = join(ROOT, "src/sites", catalog.site, "lessons");
    return existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
          .map((f) => f.slice(0, -3))
      : [];
  }),
);
const chunkSlug = (f: string) => /^assets\/(.+)-[A-Za-z0-9_-]{8}\.js$/.exec(f)?.[1] ?? null;
const isLessonChunk = (f: string) => {
  const s = chunkSlug(f);
  return s !== null && lessonSlugs.has(s);
};

const assets = files.filter((f) => f.startsWith("assets/"));
const shells = ["", "sobre/", "404.html", ...SITES.map(({ catalog }) => `${catalog.site}/`)];
const statics = files.filter((f) => /^(favicon-|manifest-).+|^fonts\/|^brand\/(icon-|apple-)/.test(f));
const precache = [...shells, ...statics, ...assets.filter((f) => !isLessonChunk(f))].map(url);

const version = createHash("sha256")
  .update(files.sort().join("\n"))
  .update(
    shells.map((s) => readFileSync(join(DIST, s.endsWith("/") || s === "" ? `${s}index.html` : s))).join(""),
  )
  .digest("hex")
  .slice(0, 12);

for (const { catalog } of SITES) {
  const site = catalog.site;
  const pages = files
    .filter((f) => f.startsWith(`${site}/`) && f.endsWith("/index.html"))
    .map((f) => f.slice(0, -"index.html".length));
  const slugs = new Set(pages.map((p) => p.split("/")[1]).filter(Boolean));
  const chunks = assets.filter((f) => {
    const s = chunkSlug(f);
    return s !== null && slugs.has(s) && isLessonChunk(f);
  });
  const list = [...pages, `${site}/search.json`, ...chunks].map(url);
  writeFileSync(join(DIST, site, "offline.json"), `${JSON.stringify(list)}\n`);
}

const src = readFileSync(join(ROOT, "src/sw.ts"), "utf8");
const { code } = await transformWithEsbuild(src, "sw.ts", { loader: "ts", target: "es2022" });
const head = [
  `const VERSION = ${JSON.stringify(version)};`,
  `const BASE = ${JSON.stringify(BASE)};`,
  `const PRECACHE = ${JSON.stringify(precache)};`,
  `const ASSETS = ${JSON.stringify(assets.map(url))};`,
].join("\n");
writeFileSync(join(DIST, "sw.js"), `${head}\n${code}`);
console.log(`build-sw: versão ${version}, ${precache.length} arquivos no precache`);
