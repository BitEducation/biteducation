import type { SiteId } from "../contracts/types.ts";
import { html, render, type SafeHtml } from "../core/dom.ts";
import { LOCALES, locale, t } from "../core/i18n.ts";
import { getTheme, setTheme, type ThemeChoice } from "../core/prefs.ts";
import { siteUrl } from "../core/router.ts";
import { icons, siteMark } from "./icons.ts";
import { bindMenu } from "./menu.ts";

export type AnySite = SiteId | "hub";

const SITES: AnySite[] = ["redes", "so", "arq", "hub"];

/** Repository link for the footer; set VITE_REPO_URL at build time (the deploy workflow does). */
const REPO_URL = ((): string => {
  const u: unknown = import.meta.env?.VITE_REPO_URL;
  return typeof u === "string" && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(u) ? u : "";
})();

export function topbarHtml(
  site: AnySite,
  opts: { crumbs?: SafeHtml; progress?: number | null; search?: boolean; indexToggle?: boolean },
): SafeHtml {
  const theme = getTheme();
  const themeIcon = theme === "dark" ? icons.moon() : theme === "light" ? icons.sun() : icons.auto();
  const lang = LOCALES.find((l) => l.code === locale()) ?? LOCALES[0];
  return html`<header class="topbar">
    <a class="skip-link" href="#main">${t("skip")}</a>
    ${opts.indexToggle ? html`<button class="icon-btn index-toggle" type="button" aria-controls="lesson-index" aria-expanded="true" aria-label="${t("index.toggle")}" data-tip="${t("index.toggle")} (L)">${icons.sidebar()}</button>` : ""}
    <div class="site-switch">
      <button class="brand" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="${t("site.switch")}">
        <span class="brand-mark ${site}">${siteMark(site, site === "hub" ? 22 : 18)}</span>
        <span>${t(`brand.${site}`)}</span>
        ${icons.chevronDown()}
      </button>
      <div class="menu site-menu" role="menu" hidden>
        ${SITES.map(
          (s) =>
            html`<a role="menuitem" href="${siteUrl(s)}" ${s === site ? html`aria-current="page"` : ""}><span class="swatch ${s}"></span>${t(`brand.${s}`)}</a>`,
        )}
      </div>
    </div>
    <nav class="crumbs" aria-label="${t("crumbs.label")}">${opts.crumbs ?? ""}</nav>
    <div class="top-tools">
      ${
        opts.search
          ? html`<button class="search-btn" type="button" aria-haspopup="dialog" aria-label="${t("search.open")}">${icons.search()}<span class="search-label">${t("search.open")}</span><kbd>/</kbd></button>`
          : ""
      }
      ${
        opts.progress !== undefined && opts.progress !== null
          ? html`<span class="site-progress" title="${t("progress.site", { pct: opts.progress })}"><span class="ring" data-v="--p:${opts.progress}"></span><span>${opts.progress}%</span></span>`
          : ""
      }
      <div class="site-switch">
        <button class="icon-btn theme-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="${t("theme.label")}" data-tip="${t("theme.label")} (T)">${themeIcon}</button>
        <div class="menu theme-menu" role="menu" hidden>
          ${(["light", "dark", "system"] as ThemeChoice[]).map(
            (c) =>
              html`<button role="menuitemradio" type="button" data-theme-choice="${c}" aria-checked="${c === theme}">${t(`theme.${c}`)}</button>`,
          )}
        </div>
      </div>
      <div class="site-switch">
        <button class="icon-btn lang-btn" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="${t("lang.label")}"><b class="micro">${lang?.short ?? "PT"}</b></button>
        <div class="menu lang-menu" role="menu" hidden>
          ${LOCALES.map((l) => html`<button role="menuitemradio" type="button" data-lang="${l.code}" lang="${l.code}" aria-checked="${l.code === locale()}">${l.name}</button>`)}
        </div>
      </div>
      <button class="icon-btn help-btn" type="button" aria-haspopup="dialog" aria-label="${t("help.open")}" data-tip="${t("help.open")} (?)">${icons.help()}</button>
    </div>
  </header>`;
}

export function bindTopbar(
  root: HTMLElement,
  handlers: {
    onSearch?: () => void;
    onHelp: () => void;
    onLang: (code: string) => void;
    onTheme?: () => void;
  },
): () => void {
  const cleanups: (() => void)[] = [];
  const pairs: [string, string, (el: HTMLElement) => void][] = [
    [".brand", ".site-menu", () => {}],
    [
      ".theme-btn",
      ".theme-menu",
      (el) => {
        const c = el.dataset.themeChoice as ThemeChoice | undefined;
        if (!c) return;
        setTheme(c);
        syncThemeButton(root);
        handlers.onTheme?.();
      },
    ],
    [".lang-btn", ".lang-menu", (el) => el.dataset.lang && handlers.onLang(el.dataset.lang)],
  ];
  for (const [b, m, pick] of pairs) {
    const btn = root.querySelector<HTMLElement>(b);
    const menu = root.querySelector<HTMLElement>(m);
    if (btn && menu) cleanups.push(bindMenu(btn, menu, pick));
  }
  const search = root.querySelector<HTMLElement>(".search-btn");
  if (search && handlers.onSearch) {
    const f = () => handlers.onSearch?.();
    search.addEventListener("click", f);
    cleanups.push(() => search.removeEventListener("click", f));
  }
  const help = root.querySelector<HTMLElement>(".help-btn");
  if (help) {
    help.addEventListener("click", handlers.onHelp);
    cleanups.push(() => help.removeEventListener("click", handlers.onHelp));
  }
  return () => {
    for (const c of cleanups) c();
  };
}

export function footerHtml(): SafeHtml {
  return html`<footer class="foot">${t("footer.licenses")} · <a href="${siteUrl("hub")}sobre/">${t("footer.about")}</a>${
    REPO_URL ? html` · <a href="${REPO_URL}" rel="noopener">${t("footer.source")}</a>` : ""
  }</footer>`;
}

/** Keeps the theme button icon and menu state in sync with the saved choice. */
export function syncThemeButton(root: ParentNode): void {
  const c = getTheme();
  for (const b of root.querySelectorAll<HTMLElement>("[data-theme-choice]"))
    b.setAttribute("aria-checked", String(b.dataset.themeChoice === c));
  const btn = root.querySelector(".theme-btn");
  if (btn) render(btn, c === "dark" ? icons.moon() : c === "light" ? icons.sun() : icons.auto());
}
