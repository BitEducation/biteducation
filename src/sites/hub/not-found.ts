import type { Catalog } from "../../contracts/types.ts";
import { html, render } from "../../core/dom.ts";
import { t } from "../../core/i18n.ts";
import { lessonUrl, siteUrl } from "../../core/router.ts";
import type { SearchItem } from "../../core/search.ts";
import { visibleLessons } from "../../core/visibility.ts";
import { bootCommon, changeLang } from "../../ui/app.ts";
import { openHelp } from "../../ui/help.ts";
import { icons } from "../../ui/icons.ts";
import { pageShortcuts } from "../../ui/page-shortcuts.ts";
import { openPalette } from "../../ui/palette.ts";
import { isSearchItems } from "../../ui/search-index.ts";
import { bindTopbar, footerHtml, topbarHtml } from "../../ui/topbar.ts";
import { catalog as arq } from "../arq/catalog.ts";
import { catalog as redes } from "../redes/catalog.ts";
import { catalog as so } from "../so/catalog.ts";

const CATALOGS: Catalog[] = [arq, so, redes];

/** Lesson titles from the catalogs: the fallback when search.json is unavailable (dev). */
function catalogItems(): SearchItem[] {
  return CATALOGS.flatMap((c) =>
    visibleLessons(c).map((l) => ({
      kind: "lesson" as const,
      title: l.title,
      sub: l.subtitle,
      url: lessonUrl(c.site, l.slug),
      group: c.name,
      text: "",
      tags: [l.slug, ...l.tags],
    })),
  );
}

let items: Promise<SearchItem[]> | null = null;
const getItems = () => {
  items ??= (async () => {
    if (!import.meta.env.PROD) return catalogItems();
    const parts = await Promise.all(
      CATALOGS.map(async (c) => {
        try {
          const res = await fetch(`${siteUrl(c.site)}search.json`, { credentials: "omit" });
          const data: unknown = res.ok ? await res.json() : null;
          return isSearchItems(data) ? data : [];
        } catch {
          return [];
        }
      }),
    );
    const all = parts.flat();
    return all.length ? all : catalogItems();
  })();
  return items;
};
const openSearch = () => openPalette(getItems, (url) => location.assign(url));

let off: () => void = () => {};
function mount() {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) return;
  off();
  render(
    root,
    html`<div class="page">${topbarHtml("hub", {})}
      <main class="page-main" id="main" tabindex="-1"><section class="hero"><div class="accent-bar"></div>
        <h1>${t("notfound.title")}</h1><p>${t("notfound.text")}</p>
        <p><button class="btn nf-search" type="button">${icons.search()} ${t("search.open")}</button></p>
        <div class="continue side-actions">${(["arq", "so", "redes", "hub"] as const).map(
          (s) =>
            html`<a class="btn${s === "hub" ? " primary" : ""}" href="${siteUrl(s)}">${t(`brand.${s}`)}</a>`,
        )}</div></section></main>${footerHtml()}</div>`,
  );
  off = bindTopbar(root, {
    onHelp: openHelp,
    onLang: (code) => void changeLang(code, mount),
  });
  root.querySelector(".nf-search")?.addEventListener("click", openSearch);
  document.title = `${t("notfound.title")} · ${t("brand.hub")}`;
}

await bootCommon("hub");
mount();
pageShortcuts(openSearch);
