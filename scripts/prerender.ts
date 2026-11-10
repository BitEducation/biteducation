/**
 * Runs after `vite build`:
 *  - one HTML per visible lesson and per glossary, with title, meta, canonical, Open Graph,
 *    JSON-LD and the full lesson text in <article class="ssr-lesson"> (readable without JS);
 *  - search.json per site, sitemap.xml and robots.txt;
 *  - the CSP <meta> in every HTML, with the sha256 of the inline theme script.
 * Env: BASE_URL (default "/"), SITE_ORIGIN (default http://localhost:4173), VITE_SHOW_REVIEW=1
 * to include lessons under review (preview builds).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { Catalog, Fact, GlossaryEntry, LessonModule, Reference } from "../src/contracts/types.ts";
import { escapeHtml, plainText, richText } from "../src/core/dom.ts";
import { type VisibilityEnv, visibleLessons } from "../src/core/visibility.ts";
import { BOOKS } from "../src/ui/books.ts";
import { buildSearchItems } from "../src/ui/search-index.ts";
import { loadLesson, SITES } from "./lib/sites.ts";

const ROOT = resolve(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const BASE = (() => {
  const b = process.env.BASE_URL ?? "/";
  return `${b.startsWith("/") ? "" : "/"}${b}${b.endsWith("/") ? "" : "/"}`;
})();
const ORIGIN = (process.env.SITE_ORIGIN ?? "http://localhost:4173").replace(/\/+$/, "");
const ENV: VisibilityEnv = { dev: false, showReview: process.env.VITE_SHOW_REVIEW === "1" };
const LICENSE = "https://creativecommons.org/licenses/by-sa/4.0/";
const LEVELS = ["Introdutório", "Intermediário", "Avançado"];

const abs = (path: string) => `${ORIGIN}${path}`;
const siteBase = (site: string) => `${BASE}${site}/`;
const esc = escapeHtml;

if (!existsSync(join(DIST, "index.html"))) {
  console.error("prerender: rode `vite build` antes (dist/index.html não existe)");
  process.exit(1);
}

/* ---------- CSP ---------- */

const INLINE_SCRIPT = /<script>([\s\S]*?)<\/script>/g;

function cspFor(htmlText: string): string {
  const hashes = [...htmlText.matchAll(INLINE_SCRIPT)].map(
    (m) =>
      `'sha256-${createHash("sha256")
        .update(m[1] as string)
        .digest("base64")}'`,
  );
  return [
    "default-src 'self'",
    `script-src 'self'${hashes.length ? ` ${hashes.join(" ")}` : ""}`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    ...(ORIGIN.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

function withCsp(htmlText: string): string {
  const clean = htmlText.replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, "");
  return clean.replace(
    /<meta charset="UTF-8" \/>/,
    (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${esc(cspFor(clean))}" />`,
  );
}

/* ---------- head ---------- */

interface Head {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  jsonLd?: object;
}

function withHead(shell: string, h: Head): string {
  const meta = [
    `<link rel="canonical" href="${esc(abs(h.path))}" />`,
    `<meta property="og:type" content="${h.type ?? "website"}" />`,
    `<meta property="og:title" content="${esc(h.title)}" />`,
    `<meta property="og:description" content="${esc(h.description)}" />`,
    `<meta property="og:url" content="${esc(abs(h.path))}" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta property="og:image" content="${esc(abs(`${BASE}brand/og-image.jpg`))}" />`,
    `<meta property="og:image:width" content="1024" />`,
    `<meta property="og:image:height" content="572" />`,
    `<meta property="og:image:alt" content="Logo do BitEducation: um livro aberto feito de pixels" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    ...(h.jsonLd
      ? [`<script type="application/ld+json">${JSON.stringify(h.jsonLd).replace(/</g, "\\u003c")}</script>`]
      : []),
  ].join("\n    ");
  return shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(h.title)}</title>`)
    .replace(
      /<meta name="description" content="[^"]*" \/>/,
      `<meta name="description" content="${esc(h.description)}" />`,
    )
    .replace(/\s*<link rel="canonical"[^>]*>|\s*<meta property="og:[^>]*>|\s*<meta name="twitter:[^>]*>/g, "")
    .replace("</head>", `    ${meta}\n  </head>`);
}

const withArticle = (shell: string, article: string) =>
  shell.replace('<div id="app"></div>', `<div id="app">${article}</div>`);

/* ---------- article ---------- */

function termLinker(site: string, glossary: GlossaryEntry[]) {
  const label = (id: string) => glossary.find((g) => g.id === id)?.term ?? null;
  const rich = (text: string) =>
    richText(text, label).value.replace(
      /<button type="button" class="term" data-term="([a-z0-9-]+)">([\s\S]*?)<\/button>/g,
      (_m, id: string, inner: string) =>
        `<a class="term" href="${siteBase(site)}glossario/#${id}">${inner}</a>`,
    );
  return { rich, plain: (text: string) => plainText(text, label) };
}

const factsHtml = (facts: readonly Fact[]) =>
  facts.length
    ? `<dl class="ssr-facts">${facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>`
    : "";

function refHtml(r: Reference): string {
  if ("book" in r) {
    const b = BOOKS[r.book];
    return `${esc(b.authors)}. <cite>${esc(b.title)}</cite>, ${esc(b.edition)}, ${typeof r.chapter === "string" ? `apêndice ${esc(r.chapter)}` : `cap. ${r.chapter}`}${r.section ? `, seção ${esc(r.section)}` : ""}${r.note ? `: ${esc(r.note)}` : ""}.`;
  }
  if ("rfc" in r) {
    const url = `https://www.rfc-editor.org/rfc/rfc${r.rfc}${r.section ? `#section-${encodeURIComponent(r.section)}` : ""}`;
    return `<a href="${url}" rel="noopener noreferrer">RFC ${r.rfc}${r.section ? `, seção ${esc(r.section)}` : ""}</a>${r.note ? `: ${esc(r.note)}` : ""}.`;
  }
  return `<a href="${esc(r.url)}" rel="noopener noreferrer">${esc(r.title)}</a>${r.note ? `: ${esc(r.note)}` : ""}.`;
}

function lessonArticle(catalog: Catalog, glossary: GlossaryEntry[], lesson: LessonModule): string {
  const { rich } = termLinker(catalog.site, glossary);
  const run = lesson.build(lesson.params.defaults);
  const steps = run.steps
    .map((s, i) => {
      const quiz = s.quiz
        ? `<details class="ssr-quiz"><summary>Pergunta: ${esc(s.quiz.prompt)}</summary>${s.quiz.kind === "choice" ? `<ol type="a">${s.quiz.options.map((o) => `<li>${esc(o)}</li>`).join("")}</ol>` : ""}${rich(s.quiz.explain)}</details>`
        : "";
      return `<section id="${esc(s.id)}"><h2>${i + 1}. ${esc(s.title)}</h2><p class="ssr-sub">${esc(s.subtitle)}</p>${rich(s.text)}${factsHtml(s.facts)}${quiz}</section>`;
    })
    .join("");
  const m = lesson.meta;
  return `<article class="ssr-lesson">
<p class="ssr-note">Versão em texto da lição. Com JavaScript, ela vira uma animação passo a passo.</p>
<h1>${esc(m.title)}</h1>
<p class="ssr-summary">${esc(m.summary)}</p>
${rich(lesson.intro.text)}${factsHtml(lesson.intro.facts)}
${steps}
<section id="fechamento"><h2>${esc(lesson.outro.title)}</h2>${rich(lesson.outro.text)}${factsHtml(lesson.outro.facts(run))}</section>
<section id="referencias"><h2>Referências</h2><ul>${m.refs.map((r) => `<li>${refHtml(r)}</li>`).join("")}</ul></section>
<section id="simplificacoes"><h2>O que foi simplificado</h2><ul>${m.simplifications.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>
<p><a href="${siteBase(catalog.site)}">${esc(catalog.name)}</a> · <a href="${siteBase(catalog.site)}glossario/">Glossário</a></p>
</article>`;
}

function siteArticle(catalog: Catalog, lessons: Catalog["lessons"]): string {
  const groups = catalog.groups
    .map((g) => {
      const ls = lessons.filter((l) => l.group === g.id);
      return ls.length
        ? `<h2>${esc(g.title)}</h2><ul>${ls.map((l) => `<li><a href="${siteBase(catalog.site)}${l.slug}/">${esc(l.title)}</a>: ${esc(l.subtitle)}</li>`).join("")}</ul>`
        : "";
    })
    .join("");
  return `<article class="ssr-lesson"><h1>${esc(catalog.name)}</h1><p class="ssr-summary">${esc(catalog.tagline)}</p>${groups || "<p>Nenhuma lição publicada ainda.</p>"}<p><a href="${siteBase(catalog.site)}glossario/">Glossário</a></p></article>`;
}

function glossaryArticle(catalog: Catalog, glossary: GlossaryEntry[]): string {
  const sorted = [...glossary].sort((a, b) => a.term.localeCompare(b.term, "pt-BR"));
  const term = (id: string) => glossary.find((g) => g.id === id)?.term ?? id;
  return `<article class="ssr-lesson"><h1>Glossário · ${esc(catalog.name)}</h1><dl class="ssr-glossary">${sorted
    .map(
      (g) =>
        `<dt id="${esc(g.id)}">${esc(g.term)}</dt><dd>${esc(g.def)}${g.see?.length ? ` Ver também: ${g.see.map((s) => `<a href="#${esc(s)}">${esc(term(s))}</a>`).join(", ")}.` : ""}</dd>`,
    )
    .join("")}</dl><p><a href="${siteBase(catalog.site)}">${esc(catalog.name)}</a></p></article>`;
}

/* ---------- write ---------- */

const written: string[] = [];
function write(path: string, content: string) {
  const file = join(DIST, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  written.push(path);
}

const sitemap: string[] = [BASE, `${BASE}sobre/`];

for (const { catalog, glossary } of SITES) {
  const site = catalog.site;
  const shell = readFileSync(join(DIST, site, "index.html"), "utf8");
  const lessons = visibleLessons(catalog, ENV);
  const siteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: catalog.name,
    description: catalog.tagline,
    url: abs(siteBase(site)),
    inLanguage: "pt-BR",
    license: LICENSE,
  };

  write(
    join(site, "index.html"),
    withCsp(
      withArticle(
        withHead(shell, {
          title: `${catalog.name}`,
          description: catalog.tagline,
          path: siteBase(site),
          jsonLd: siteJsonLd,
        }),
        siteArticle(catalog, lessons),
      ),
    ),
  );
  sitemap.push(siteBase(site));

  for (const entry of lessons) {
    const lesson = await loadLesson(entry.load);
    const path = `${siteBase(site)}${entry.slug}/`;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "LearningResource",
      name: lesson.meta.title,
      description: lesson.meta.summary,
      url: abs(path),
      inLanguage: "pt-BR",
      educationalLevel: LEVELS[entry.level - 1] ?? LEVELS[0],
      timeRequired: `PT${entry.minutes}M`,
      learningResourceType: "Simulação interativa",
      teaches: entry.tags,
      isPartOf: { "@type": "WebSite", name: catalog.name, url: abs(siteBase(site)) },
      license: LICENSE,
    };
    const page = withHead(shell, {
      title: `${entry.title} · ${catalog.name}`,
      description: lesson.meta.summary,
      path,
      type: "article",
      jsonLd,
    });
    write(
      join(site, entry.slug, "index.html"),
      withCsp(withArticle(page, lessonArticle(catalog, glossary, lesson))),
    );
    sitemap.push(path);
  }

  const gPath = `${siteBase(site)}glossario/`;
  write(
    join(site, "glossario", "index.html"),
    withCsp(
      withArticle(
        withHead(shell, {
          title: `Glossário · ${catalog.name}`,
          description: `Os termos usados nas lições de ${catalog.name}, com definições curtas.`,
          path: gPath,
        }),
        glossaryArticle(catalog, glossary),
      ),
    ),
  );
  sitemap.push(gPath);

  const items = await buildSearchItems({ catalog, glossary, columns: [] }, true, ENV);
  const rebased = items.map((it) => ({ ...it, url: `${BASE}${it.url.replace(/^\//, "")}` }));
  write(join(site, "search.json"), JSON.stringify(rebased));
}

for (const [path, head] of [
  [
    "index.html",
    {
      title: "BitEducation",
      description:
        "Lições interativas de redes, sistemas operacionais e arquitetura de computadores, passo a passo.",
      path: BASE,
    },
  ],
  [
    "sobre/index.html",
    {
      title: "Sobre · BitEducation",
      description: "Privacidade, licenças, bibliografia e créditos do projeto.",
      path: `${BASE}sobre/`,
    },
  ],
] as const) {
  write(path, withCsp(withHead(readFileSync(join(DIST, path), "utf8"), head)));
}
write("404.html", withCsp(readFileSync(join(DIST, "404.html"), "utf8")));

write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap.map((p) => `  <url><loc>${esc(abs(p))}</loc></url>`).join("\n")}\n</urlset>\n`,
);
write("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${abs(`${BASE}sitemap.xml`)}\n`);

// every HTML in dist must carry the CSP, including ones this script did not generate
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) =>
    statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".html") ? [join(d, f)] : [],
  );
for (const file of walk(DIST)) {
  const rel = relative(DIST, file);
  if (!written.includes(rel)) write(rel, withCsp(readFileSync(file, "utf8")));
}

console.log(
  `prerender: ${written.length} arquivos (base ${BASE}, origem ${ORIGIN}, revisão ${ENV.showReview ? "incluída" : "fora"})`,
);
