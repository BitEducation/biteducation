import type { Catalog, EventColumn, GlossaryEntry, SiteId, Trail } from "../contracts/types.ts";

export interface LinkItem {
  site: SiteId;
  slug: string;
  title: string;
  /** Short site name ("SO"), shown next to the title. */
  siteName: string;
}

/** Data that crosses sites, resolved by src/sites/shared (the UI never imports the catalogs). */
export interface CrossSite {
  related: (site: SiteId, slug: string) => LinkItem[];
  trails: (site: SiteId | null) => Trail[];
  title: (ref: string) => LinkItem | null;
}

/** Everything a site entry point hands to the shell. */
export interface SiteConfig {
  catalog: Catalog;
  glossary: readonly GlossaryEntry[];
  columns: EventColumn[];
  cross?: CrossSite;
}
