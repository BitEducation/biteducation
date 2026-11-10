import type { Catalog, GlossaryEntry, LessonModule } from "../../src/contracts/types.ts";
import { catalog as arq } from "../../src/sites/arq/catalog.ts";
import { glossary as arqG } from "../../src/sites/arq/glossary.ts";
import { catalog as redes } from "../../src/sites/redes/catalog.ts";
import { glossary as redesG } from "../../src/sites/redes/glossary.ts";
import { catalog as so } from "../../src/sites/so/catalog.ts";
import { glossary as soG } from "../../src/sites/so/glossary.ts";

/** The three content sites, as the build scripts see them (pure modules, no DOM). */
export const SITES: { catalog: Catalog; glossary: GlossaryEntry[] }[] = [
  { catalog: redes, glossary: redesG },
  { catalog: so, glossary: soG },
  { catalog: arq, glossary: arqG },
];

export async function loadLesson(load: () => Promise<{ default: LessonModule }>): Promise<LessonModule> {
  return (await load()).default;
}

/** Lessons of redes that simulate an attack must show signals and defense. */
export const ATTACK_LESSONS = new Set([
  "arp-spoofing",
  "syn-flood",
  "dns-poisoning",
  "amplificacao",
  "ssl-stripping",
  "firewall-varredura",
  "bgp-hijack",
]);
