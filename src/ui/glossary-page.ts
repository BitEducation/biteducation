import { html, render } from "../core/dom.ts";
import { t } from "../core/i18n.ts";
import { openHelp } from "./help.ts";
import { type PageDeps, pageShortcuts } from "./page-shortcuts.ts";
import type { SiteConfig } from "./site-config.ts";
import { bindTopbar, footerHtml, topbarHtml } from "./topbar.ts";

/** /<site>/glossario/: every term with an anchor. */
export function mountGlossaryPage(root: HTMLElement, config: SiteConfig, deps: PageDeps): () => void {
  const { catalog, glossary } = config;
  const sorted = [...glossary].sort((a, b) => a.term.localeCompare(b.term, "pt-BR"));
  const termOf = (id: string) => glossary.find((g) => g.id === id)?.term ?? id;
  render(
    root,
    html`<div class="page">${topbarHtml(catalog.site, { search: true })}
      <main class="page-main" id="main" tabindex="-1">
        <section class="hero"><div class="accent-bar"></div><h1>${t("glossary.title")}</h1><p>${t(`brand.${catalog.site}`)}</p></section>
        <dl class="glossary prose">${sorted.map(
          (g) =>
            html`<dt id="${g.id}">${g.term}</dt><dd><p>${g.def}</p>${
              g.see?.length
                ? html`<p class="micro">${t("glossary.see")} ${g.see.map((s, i) => html`${i ? ", " : ""}<a href="#${s}">${termOf(s)}</a>`)}</p>`
                : ""
            }</dd>`,
        )}</dl>
      </main>${footerHtml()}</div>`,
  );
  const offTop = bindTopbar(root, { onSearch: deps.openSearch, onHelp: openHelp, onLang: deps.onLang });
  const offKeys = pageShortcuts(deps.openSearch);
  document.title = `${t("glossary.title")} · ${t(`brand.${catalog.site}`)}`;
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  return () => {
    offTop();
    offKeys();
  };
}
