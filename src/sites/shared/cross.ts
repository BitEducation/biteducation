import type { Catalog, SiteId } from "../../contracts/types.ts";
import { visibleLessons } from "../../core/visibility.ts";
import type { CrossSite, LinkItem } from "../../ui/site-config.ts";
import { catalog as arq } from "../arq/catalog.ts";
import { catalog as redes } from "../redes/catalog.ts";
import { catalog as so } from "../so/catalog.ts";
import { TRAILS } from "./trails.ts";

const CATALOGS: Catalog[] = [redes, so, arq];
const SHORT: Record<SiteId, string> = { redes: "Redes", so: "SO", arq: "Arquitetura" };

function find(ref: string): LinkItem | null {
  const [site, slug] = ref.split("/") as [SiteId, string];
  const cat = CATALOGS.find((c) => c.site === site);
  const l = cat && visibleLessons(cat).find((x) => x.slug === slug);
  return l ? { site, slug, title: l.title, siteName: SHORT[site] } : null;
}

/** Related lessons in both directions: declaring A → B also shows A on B. */
function related(site: SiteId, slug: string): LinkItem[] {
  const self = `${site}/${slug}`;
  const refs = new Set<string>();
  for (const c of CATALOGS)
    for (const l of c.lessons) {
      const me = `${c.site}/${l.slug}`;
      if (me === self) for (const r of l.related ?? []) refs.add(r);
      else if (l.related?.includes(self)) refs.add(me);
    }
  return [...refs].map(find).filter((x): x is LinkItem => x !== null);
}

export const cross: CrossSite = {
  related,
  title: find,
  trails: (site) =>
    TRAILS.map((t) => ({ ...t, items: t.items.filter((r) => find(r)) })).filter(
      (t) => t.items.length >= 3 && (site === null || t.items.some((r) => r.startsWith(`${site}/`))),
    ),
};
