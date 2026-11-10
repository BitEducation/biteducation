import type { SiteId } from "../contracts/types.ts";
import { html, render } from "../core/dom.ts";
import { setSourceStrings, t } from "../core/i18n.ts";
import { applyTheme } from "../core/prefs.ts";
import { parseRoute, siteUrl } from "../core/router.ts";
import type { SearchItem } from "../core/search.ts";
import { visibleLessons } from "../core/visibility.ts";
import { mountGlossaryPage } from "./glossary-page.ts";
import { openHelp } from "./help.ts";
import { mountLesson } from "./lesson-view.ts";
import type { Tab } from "./narrative.ts";
import { registerServiceWorker } from "./offline.ts";
import { type PageDeps, pageShortcuts } from "./page-shortcuts.ts";
import { openPalette } from "./palette.ts";
import { buildSearchItems, isSearchItems } from "./search-index.ts";
import type { SiteConfig } from "./site-config.ts";
import { mountSiteHome } from "./site-home.ts";
import { UI } from "./strings.ts";
import "./styles/app.css";
import { type AnySite, bindTopbar, footerHtml, topbarHtml } from "./topbar.ts";

/** Theme and strings: shared by every page (sites, hub, about, 404). */
export async function bootCommon(site: AnySite): Promise<void> {
  setSourceStrings(UI);
  applyTheme();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme());
  document.documentElement.dataset.site = site;
  registerServiceWorker();
  // GitHub Pages cannot send frame-ancestors; embedding stays allowed (teachers use LMSs),
  // but the page points to the original site.
  if (window.top !== window.self && !document.querySelector(".frame-notice")) {
    const bar = document.createElement("div");
    bar.className = "frame-notice";
    bar.setAttribute("role", "note");
    render(bar, html`<a href="${location.href}" target="_blank" rel="noopener">${t("frame.notice")}</a>`);
    document.body.prepend(bar);
  }
  // The prerendered article is the no-JS and print version; keep it out of the app root.
  const ssr = document.querySelector("#app .ssr-lesson");
  if (ssr) {
    ssr.classList.add("print-only");
    document.querySelector("#app")?.after(ssr);
  }
}

const isModified = (e: MouseEvent) => e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;

/** Single-page navigation inside one site. */
export async function bootSite(config: SiteConfig): Promise<void> {
  const site: SiteId = config.catalog.site;
  await bootCommon(site);
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) return;
  let dispose: () => void = () => {};
  let searchCache: Promise<SearchItem[]> | null = null;
  let seq = 0;

  const getItems = () => {
    searchCache ??= (async () => {
      if (import.meta.env.PROD) {
        try {
          const res = await fetch(`${siteUrl(site)}search.json`, { credentials: "omit" });
          const data: unknown = res.ok ? await res.json() : null;
          if (isSearchItems(data)) return data;
        } catch {
          /* fall back to the catalog below */
        }
        return buildSearchItems(config, false);
      }
      return buildSearchItems(config, true);
    })();
    return searchCache;
  };
  const openSearch = () => openPalette(getItems, (url) => navigate(url));

  async function show(tab?: Tab) {
    const id = ++seq;
    dispose();
    dispose = () => {};
    const route = parseRoute(location);
    if (route.site !== site) {
      location.reload();
      return;
    }
    const common: PageDeps = { openSearch };
    if (!route.slug) {
      dispose = mountSiteHome(root as HTMLElement, config, common);
      return;
    }
    if (route.slug === "glossario") {
      dispose = mountGlossaryPage(root as HTMLElement, config, common);
      return;
    }
    const entry = visibleLessons(config.catalog).find((l) => l.slug === route.slug);
    if (!entry) {
      dispose = messagePage(root as HTMLElement, site, t("lesson.missing"), common);
      return;
    }
    let mod: Awaited<ReturnType<typeof entry.load>>;
    try {
      mod = await entry.load();
    } catch {
      if (id === seq) dispose = messagePage(root as HTMLElement, site, t("lesson.loadError"), common);
      return;
    }
    if (id !== seq) return;
    dispose = mountLesson(root as HTMLElement, {
      config,
      entry,
      lesson: mod.default,
      route,
      ...(tab ? { tab } : {}),
      navigate,
      ...common,
    });
  }

  function navigate(url: string, opts: { replace?: boolean; tab?: Tab } = {}) {
    const target = new URL(url, location.href);
    if (target.origin !== location.origin || parseRoute(target).site !== site) {
      location.assign(target.href);
      return;
    }
    document.querySelector(".ssr-lesson")?.remove();
    if (opts.replace) history.replaceState(null, "", target.pathname + target.search + target.hash);
    else history.pushState(null, "", target.pathname + target.search + target.hash);
    void show(opts.tab).then(() => {
      if (!opts.replace) {
        window.scrollTo(0, 0);
        document.querySelector<HTMLElement>("#main")?.focus({ preventScroll: true });
      }
    });
  }

  document.addEventListener("click", (e) => {
    const a = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
    if (!a || isModified(e) || a.target || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || parseRoute(url).site !== site) return;
    if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
  });
  window.addEventListener("popstate", () => {
    document.querySelector(".ssr-lesson")?.remove();
    void show();
  });

  await show();
}

function messagePage(root: HTMLElement, site: SiteId, message: string, common: PageDeps): () => void {
  render(
    root,
    html`<div class="page">${topbarHtml(site, {})}
      <main class="page-main" id="main" tabindex="-1"><div class="hero"><div class="accent-bar"></div><h1>${message}</h1>
      <p><a href="${siteUrl(site)}">${t(`brand.${site}`)}</a></p></div></main>${footerHtml()}</div>`,
  );
  const offTop = bindTopbar(root, { onHelp: openHelp });
  const offKeys = pageShortcuts(common.openSearch);
  return () => {
    offTop();
    offKeys();
  };
}
