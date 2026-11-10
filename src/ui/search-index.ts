import type { LessonModule } from "../contracts/types.ts";
import { plainText } from "../core/dom.ts";
import { lessonUrl, siteUrl } from "../core/router.ts";
import type { SearchItem } from "../core/search.ts";
import { type VisibilityEnv, visibleLessons } from "../core/visibility.ts";
import type { SiteConfig } from "./site-config.ts";

/**
 * Builds the search index of a site. The build writes it to dist/<site>/search.json
 * with steps included; in dev the palette builds it on the fly.
 */
export async function buildSearchItems(
  config: SiteConfig,
  withSteps: boolean,
  env?: VisibilityEnv,
): Promise<SearchItem[]> {
  const { catalog, glossary } = config;
  const term = (id: string) => glossary.find((g) => g.id === id)?.term ?? null;
  const groupTitle = (id: string) => catalog.groups.find((g) => g.id === id)?.title ?? "";
  const items: SearchItem[] = [];
  for (const l of visibleLessons(catalog, env)) {
    items.push({
      kind: "lesson",
      title: l.title,
      sub: l.subtitle,
      url: lessonUrl(catalog.site, l.slug),
      group: groupTitle(l.group),
      text: "",
      tags: [l.slug, ...l.tags],
    });
    if (!withSteps) continue;
    let mod: LessonModule;
    try {
      mod = (await l.load()).default;
    } catch {
      continue;
    }
    const run = mod.build(mod.params.defaults);
    for (const s of run.steps)
      items.push({
        kind: "step",
        title: s.title,
        sub: l.title,
        url: lessonUrl(catalog.site, l.slug, { step: s.id }),
        group: groupTitle(l.group),
        text: plainText(`${s.subtitle} ${s.text}`, term).slice(0, 600),
        ...(s.tags ? { tags: s.tags } : {}),
      });
  }
  for (const g of glossary)
    items.push({
      kind: "term",
      title: g.term,
      sub: g.def.slice(0, 120),
      url: `${siteUrl(catalog.site)}glossario/#${g.id}`,
      group: "",
      text: g.def,
    });
  return items;
}

export function isSearchItems(v: unknown): v is SearchItem[] {
  return (
    Array.isArray(v) &&
    v.length <= 5000 &&
    v.every(
      (x) =>
        typeof x === "object" &&
        x !== null &&
        ["lesson", "step", "term"].includes((x as SearchItem).kind) &&
        typeof (x as SearchItem).title === "string" &&
        typeof (x as SearchItem).url === "string" &&
        (x as SearchItem).url.startsWith("/"),
    )
  );
}
