/**
 * Scaffolds a lesson from the house pattern:
 *   npm run new -- <redes|so|arq> <slug> "Título da lição" [--grupo <id>]
 * Writes src/sites/<site>/lessons/<slug>.ts and <slug>.test.ts and appends a `draft`
 * entry to the site's catalog. The skeleton passes `npm run check`; replace every TODO.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { SITES } from "./lib/sites.ts";

const ROOT = resolve(import.meta.dirname, "..");
const [site, slug, title, ...rest] = process.argv.slice(2);
const fail = (msg: string): never => {
  console.error(`new-lesson: ${msg}`);
  console.error('uso: npm run new -- <redes|so|arq> <slug> "Título" [--grupo <id>]');
  process.exit(1);
};

const entry = SITES.find((s) => s.catalog.site === site) ?? fail(`site desconhecido: ${site ?? "(vazio)"}`);
if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
  fail("o slug deve ser kebab-case: letras, números e hífens");
if (!title?.trim()) fail("falta o título");
const gi = rest.indexOf("--grupo");
const group = gi >= 0 ? rest[gi + 1] : entry.catalog.groups[0]?.id;
if (!group || !entry.catalog.groups.some((g) => g.id === group))
  fail(`grupo inválido: ${group}. Opções: ${entry.catalog.groups.map((g) => g.id).join(", ")}`);
if (entry.catalog.lessons.some((l) => l.slug === slug)) fail(`${site}/${slug} já está no catálogo`);

const dir = join(ROOT, "src/sites", site as string, "lessons");
const file = join(dir, `${slug}.ts`);
const test = join(dir, `${slug}.test.ts`);
if (existsSync(file) || existsSync(test)) fail(`${file} já existe`);
const q = (s: string) => JSON.stringify(s);

writeFileSync(
  file,
  `import type { LessonModule, SceneSpec } from "../../../contracts/types.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";

/**
 * TODO: what this lesson shows and which facts the owner must confirm in the references.
 * Keep the numbers here derived from the simulation, never typed by hand in the text.
 */
const scene: SceneSpec = {
  viewBox: [960, 600],
  nodes: [
    { id: "a", kind: "box", label: "TODO A", at: [300, 300], w: 150 },
    { id: "b", kind: "box", label: "TODO B", at: [660, 300], w: 150 },
  ],
  links: [{ id: "l1", from: "a", to: "b" }],
};

function build() {
  const b = lessonBuilder();
  b.step(
    {
      id: "s1-inicio",
      title: "TODO primeiro passo",
      subtitle: "TODO subtítulo",
      text: "TODO: explique o que acontece neste passo em 25 a 110 palavras, com frases curtas e um conceito por vez. Use colchetes duplos com o id de um termo para ligar ao glossário e derive os números da simulação. Este texto existe só para o esqueleto passar nas verificações de conteúdo.",
      facts: [["TODO", "valor"]],
      highlight: ["a", "b"],
    },
    () => {
      b.ev({ t: 1, kind: "move", from: "a", to: "b", role: "a", label: "TODO evento" });
    },
  );
  return b.done({});
}

const lesson: LessonModule = {
  meta: {
    slug: ${q(slug as string)},
    site: ${q(site as string)},
    title: ${q(title as string)},
    summary: "TODO: uma frase sobre o que a pessoa vai ver.",
    area: "TODO",
    refs: [{ book: "tanenbaum-mos", chapter: 1, note: "TODO: capítulo e seção certos", verified: false }],
    simplifications: ["TODO: o que a lição simplifica e por quê."],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "TODO: o problema que a lição resolve, em linguagem simples.",
    facts: [["TODO", "valor"]],
  },
  outro: {
    title: "TODO resumo",
    text: "TODO: a ideia central em duas frases.",
    facts: () => [["TODO", "valor"]],
  },
};

export default lesson;
`,
);

writeFileSync(
  test,
  `import { describe, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./${slug}.ts";

describe("lesson ${slug}", () => {
  const run = lesson.build(lesson.params.defaults);
  it("tiles the trace, frames are valid and the build is deterministic", () => {
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
  });
  it.todo("checks the numbers the text quotes against the simulation");
});
`,
);

const catalogFile = join(ROOT, "src/sites", site as string, "catalog.ts");
const src = readFileSync(catalogFile, "utf8");
const close = src.lastIndexOf("  ],\n};");
if (close < 0) fail(`não achei o fim da lista de lições em ${catalogFile}`);
const item = `    {
      slug: ${q(slug as string)},
      title: ${q(title as string)},
      subtitle: "TODO",
      group: ${q(group as string)},
      level: 1,
      minutes: 10,
      steps: 1,
      status: "draft",
      tags: [],
      load: () => import("./lessons/${slug}.ts"),
    },
`;
writeFileSync(catalogFile, src.slice(0, close) + item + src.slice(close));

console.log(`criados:
  src/sites/${site}/lessons/${slug}.ts
  src/sites/${site}/lessons/${slug}.test.ts
  entrada "draft" em src/sites/${site}/catalog.ts (aparece só em npm run dev)
Próximo passo: troque os TODO e rode npm run check.`);
