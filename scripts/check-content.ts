/**
 * Content checks. Runs every lesson with its default params and validates the
 * catalog, the steps, quizzes, glossary links, attack-lesson structure and banned phrases.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Fact, LessonModule, LessonRun } from "../src/contracts/types.ts";
import { TRAILS } from "../src/sites/shared/trails.ts";
import { ATTACK_LESSONS, loadLesson, SITES } from "./lib/sites.ts";

const ROOT = resolve(import.meta.dirname, "..");
const STEP_ID = /^s\d+-[a-z0-9-]+$/;
const TERM = /\[\[([a-z0-9-]+)(?:\|[^\]]+)?\]\]/g;
const banned = readFileSync(join(ROOT, "scripts/banned-phrases.txt"), "utf8")
  .split("\n")
  .map((l) => l.trim().toLowerCase())
  .filter((l) => l && !l.startsWith("#"));

const errors: string[] = [];
const warnings: string[] = [];
const words = (s: string) =>
  s
    .replace(/[`*[\]|]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

for (const { catalog, glossary } of SITES) {
  const site = catalog.site;
  const ids = new Set(glossary.map((g) => g.id));
  const err = (where: string, msg: string) => errors.push(`${site}/${where}: ${msg}`);

  // glossary
  if (ids.size !== glossary.length) err("glossario", "ids repetidos");
  for (const g of glossary) {
    if (g.def.length > 280) err(`glossario#${g.id}`, `definição com ${g.def.length} caracteres (máx. 280)`);
    for (const s of g.see ?? [])
      if (!ids.has(s)) err(`glossario#${g.id}`, `"ver também" aponta para ${s}, que não existe`);
  }

  const textChecks = (where: string, text: string) => {
    for (const m of text.matchAll(TERM))
      if (!ids.has(m[1] as string)) err(where, `[[${m[1]}]] não está no glossário`);
    const low = text.toLowerCase();
    for (const b of banned) if (low.includes(b)) err(where, `frase proibida: "${b}"`);
  };
  const factChecks = (where: string, facts: readonly Fact[]) => {
    for (const [k, v] of facts) textChecks(where, `${k} ${v}`);
  };

  // catalog ↔ files
  const dir = join(ROOT, "src/sites", site, "lessons");
  const onDisk = existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
        .map((f) => f.slice(0, -3))
    : [];
  const slugs = catalog.lessons.map((l) => l.slug);
  if (new Set(slugs).size !== slugs.length) err("catalog", "slugs repetidos");
  for (const f of onDisk) if (!slugs.includes(f)) err(`lessons/${f}.ts`, "arquivo de lição fora do catálogo");
  for (const g of new Set(catalog.lessons.map((l) => l.group)))
    if (!catalog.groups.some((x) => x.id === g)) err("catalog", `grupo ${g} não existe`);
  // prerequisites: existing lessons of the same site, never the lesson itself, and no cycles
  const pre = new Map(catalog.lessons.map((l) => [l.slug, l.prerequisites ?? []]));
  for (const [slug, list] of pre)
    for (const p of list) {
      if (p === slug) err(`catalog/${slug}`, "a lição é pré-requisito de si mesma");
      else if (!pre.has(p)) err(`catalog/${slug}`, `pré-requisito ${p} não existe`);
    }
  const visiting = new Set<string>();
  const done = new Set<string>();
  const walk = (slug: string, path: string[]): void => {
    if (done.has(slug)) return;
    if (visiting.has(slug)) {
      err("catalog", `ciclo de pré-requisitos: ${[...path, slug].join(" → ")}`);
      return;
    }
    visiting.add(slug);
    for (const p of pre.get(slug) ?? []) walk(p, [...path, slug]);
    visiting.delete(slug);
    done.add(slug);
  };
  for (const slug of pre.keys()) walk(slug, []);

  for (const entry of catalog.lessons) {
    const where = entry.slug;
    if (!onDisk.includes(entry.slug)) {
      err(where, "sem arquivo em lessons/");
      continue;
    }
    let lesson: LessonModule;
    let run: LessonRun;
    try {
      lesson = await loadLesson(entry.load);
      run = lesson.build(lesson.params.defaults);
    } catch (e) {
      err(where, `falha ao montar a lição: ${(e as Error).message}`);
      continue;
    }
    const m = lesson.meta;
    if (m.slug !== entry.slug || m.site !== site) err(where, `meta diz ${m.site}/${m.slug}`);
    if (!m.refs.length) err(where, "sem referências");
    if (entry.status === "published" && m.refs.some((r) => "verified" in r && !r.verified))
      err(where, "publicada com referência não verificada");
    if (entry.steps !== run.steps.length)
      err(where, `catálogo diz ${entry.steps} passos, a lição tem ${run.steps.length}`);
    textChecks(`${where}/intro`, lesson.intro.text);
    factChecks(`${where}/intro`, lesson.intro.facts);
    textChecks(`${where}/outro`, `${lesson.outro.title} ${lesson.outro.text}`);
    const seen = new Set<string>();
    for (const s of run.steps) {
      const w = `${where}/${s.id}`;
      if (!STEP_ID.test(s.id)) err(w, "id fora do padrão s<n>-texto");
      if (seen.has(s.id)) err(w, "id repetido");
      seen.add(s.id);
      const n = words(s.text);
      if (n > 110) err(w, `texto com ${n} palavras (máx. 110)`);
      if (n < 25) err(w, `texto com ${n} palavras (mín. 25)`);
      if (words(s.title) > 5) err(w, `título com ${words(s.title)} palavras (máx. 5): "${s.title}"`);
      textChecks(w, `${s.title} ${s.subtitle} ${s.text}`);
      factChecks(w, s.facts);
      const q = s.quiz;
      if (q) {
        if (!q.explain.trim()) err(w, "quiz sem explicação");
        textChecks(`${w}/quiz`, `${q.prompt} ${q.explain}`);
        if (q.kind === "choice" && (q.answer < 0 || q.answer >= q.options.length))
          err(w, "resposta do quiz fora das opções");
        if (q.kind === "pick" && !q.targets.some((t) => t.id === q.answer))
          err(w, "resposta do quiz não é um dos alvos");
        if (q.kind === "number" && !Number.isFinite(q.answer)) err(w, "resposta numérica inválida");
      }
    }
    if (site === "redes" && ATTACK_LESSONS.has(entry.slug)) {
      if (!run.steps.some((s) => s.tags?.includes("signals")))
        err(where, "lição de ataque sem passo de sinais (tag signals)");
      if (!run.steps.some((s) => s.tags?.includes("defense")))
        err(where, "lição de ataque sem passo de defesa (tag defense)");
    }
    // practice: 40 seeds per exercise, every answer finite and every text free of holes
    for (const p of lesson.practice ?? []) {
      const w = `${where}/praticar:${p.title}`;
      if (words(p.title) > 5) err(w, "título com mais de 5 palavras");
      for (let seed = 1; seed <= 40; seed++) {
        let item: ReturnType<typeof p.make>;
        try {
          item = p.make(seed);
        } catch (e) {
          err(w, `semente ${seed}: ${(e as Error).message}`);
          break;
        }
        const all = `${item.prompt} ${item.explain} ${item.unit ?? ""}`;
        if (!Number.isFinite(item.answer)) err(w, `semente ${seed}: resposta ${item.answer}`);
        if (/undefined|NaN|\[object/.test(all))
          err(w, `semente ${seed}: texto com buraco: ${all.slice(0, 120)}`);
        if (words(item.prompt) > 70) err(w, `semente ${seed}: enunciado com ${words(item.prompt)} palavras`);
        if (seed === 1) textChecks(w, all);
      }
    }
    for (const n of lesson.next ?? [])
      if (!slugs.includes(n))
        warnings.push(`${site}/${where}: "próxima" aponta para ${n}, que ainda não existe`);
  }
}

// cross-site links and trails: "site/slug" of a lesson that exists
const REF = /^(redes|so|arq)\/[a-z0-9-]+$/;
const exists = (ref: string) => {
  const [site, slug] = ref.split("/");
  return SITES.some((s) => s.catalog.site === site && s.catalog.lessons.some((l) => l.slug === slug));
};
for (const { catalog } of SITES)
  for (const l of catalog.lessons)
    for (const r of l.related ?? []) {
      const where = `${catalog.site}/catalog/${l.slug}`;
      if (!REF.test(r) || !exists(r)) errors.push(`${where}: relacionada ${r} não existe`);
      else if (r.startsWith(`${catalog.site}/`))
        errors.push(`${where}: relacionada ${r} é do mesmo site (use prerequisites)`);
    }
const trailIds = new Set<string>();
for (const tr of TRAILS) {
  if (trailIds.has(tr.id)) errors.push(`trilhas/${tr.id}: id repetido`);
  trailIds.add(tr.id);
  if (tr.items.length < 3) errors.push(`trilhas/${tr.id}: menos de 3 lições`);
  if (new Set(tr.items).size !== tr.items.length) errors.push(`trilhas/${tr.id}: lição repetida`);
  for (const r of tr.items) if (!REF.test(r) || !exists(r)) errors.push(`trilhas/${tr.id}: ${r} não existe`);
}

for (const w of warnings) console.warn(`aviso: ${w}`);
if (errors.length) {
  console.error(`check-content: ${errors.length} problema(s)\n${errors.join("\n")}`);
  process.exit(1);
}
console.log(`check-content: ok (${SITES.reduce((n, s) => n + s.catalog.lessons.length, 0)} lições)`);
