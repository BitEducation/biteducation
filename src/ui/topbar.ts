import type { SiteId } from "../contracts/types.ts";
import { html, render, type SafeHtml } from "../core/dom.ts";
import { t } from "../core/i18n.ts";
import { getTheme, setTheme, type ThemeChoice } from "../core/prefs.ts";
import { siteUrl } from "../core/router.ts";
import { icons, siteMark } from "./icons.ts";
import { bindMenu } from "./menu.ts";

export type AnySite = SiteId | "hub";

/** Site menu order: the hub first, then the topics. */
const SITES: AnySite[] = ["hub", "arq", "so", "redes"];

/** Repository link for the footer; VITE_REPO_URL overrides it at build time (forks). */
const REPO_URL = ((): string => {
  const u: unknown = import.meta.env?.VITE_REPO_URL;
  return typeof u === "string" && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(u)
    ? u
    : "https://github.com/BitEducation/biteducation.github.io";
})();

export function topbarHtml(
  site: AnySite,
  opts: { crumbs?: SafeHtml; progress?: number | null; indexToggle?: boolean; back?: "site" | "hub" },
): SafeHtml {
  const theme = getTheme();
  const themeIcon = theme === "dark" ? icons.moon() : theme === "light" ? icons.sun() : icons.auto();
  return html`<header class="topbar">
    <a class="skip-link" href="#main">${t("skip")}</a>
    ${
      opts.back
        ? html`<a class="icon-btn back-btn" href="${siteUrl(opts.back === "hub" ? "hub" : site)}" aria-label="${t(`back.${opts.back}`)}" data-tip="${t(`back.${opts.back}`)}">${icons.back()}</a>`
        : ""
    }
    ${opts.indexToggle ? html`<button class="icon-btn index-toggle" type="button" aria-controls="lesson-index" aria-expanded="true" aria-label="${t("index.toggle")}" data-tip="${t("index.toggle")} (L)">${icons.sidebar()}</button>` : ""}
    <div class="site-switch">
      <button class="brand" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="${t("site.switch")}">
        <span class="brand-mark ${site}">${siteMark(site, 18)}</span>
        <span translate="no">${t(`brand.${site}`)}</span>
        ${icons.chevronDown()}
      </button>
      <div class="menu site-menu" role="menu" hidden>
        ${SITES.map(
          (s) =>
            html`<a role="menuitem" href="${siteUrl(s)}" ${s === site ? html`aria-current="page"` : ""}><span class="swatch ${s}"></span><span translate="no">${t(`brand.${s}`)}</span></a>`,
        )}
      </div>
    </div>
    <nav class="crumbs" aria-label="${t("crumbs.label")}">${opts.crumbs ?? ""}</nav>
    <div class="top-tools">
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
      <button class="icon-btn help-btn" type="button" aria-haspopup="dialog" aria-label="${t("help.open")}" data-tip="${t("help.open")} (?)">${icons.help()}</button>
    </div>
  </header>`;
}

export function bindTopbar(
  root: HTMLElement,
  handlers: {
    onHelp: () => void;
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
  ];
  for (const [b, m, pick] of pairs) {
    const btn = root.querySelector<HTMLElement>(b);
    const menu = root.querySelector<HTMLElement>(m);
    if (btn && menu) cleanups.push(bindMenu(btn, menu, pick));
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

/** Author credit, same line as the author's other projects. */
const AUTHOR_URL = "https://www.linkedin.com/in/brennocm";

export function footerHtml(): SafeHtml {
  const sep = html`<span class="sep" aria-hidden="true">|</span>`;
  // Each item is a nowrap unit, so on narrow screens the line breaks only between items.
  return html`<footer class="foot"><span>${t("footer.about")} <a href="${siteUrl("hub")}sobre/">${t("footer.privacy")}</a></span>${sep}<span><a href="${REPO_URL}" rel="noopener">${t("footer.source")}</a></span>${sep}<span>by <a href="${AUTHOR_URL}" target="_blank" rel="noopener noreferrer">brennocm</a></span></footer>`;
}

/** Keeps the theme button icon and menu state in sync with the saved choice. */
export function syncThemeButton(root: ParentNode): void {
  const c = getTheme();
  for (const b of root.querySelectorAll<HTMLElement>("[data-theme-choice]"))
    b.setAttribute("aria-checked", String(b.dataset.themeChoice === c));
  const btn = root.querySelector(".theme-btn");
  if (btn) render(btn, c === "dark" ? icons.moon() : c === "light" ? icons.sun() : icons.auto());
}
