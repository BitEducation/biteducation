import type { Catalog, SiteId } from "../../contracts/types.ts";
import { html, render } from "../../core/dom.ts";
import { t } from "../../core/i18n.ts";
import { lessonPercent, loadProgress } from "../../core/progress.ts";
import { siteUrl } from "../../core/router.ts";
import { visibleLessons } from "../../core/visibility.ts";
import { bootCommon, changeLang } from "../../ui/app.ts";
import { openHelp } from "../../ui/help.ts";
import { brandSymbol, siteMark } from "../../ui/icons.ts";
import { pageShortcuts } from "../../ui/page-shortcuts.ts";
import { bindTopbar, footerHtml, topbarHtml } from "../../ui/topbar.ts";
import { trailsHtml } from "../../ui/trails.ts";
import { catalog as arq } from "../arq/catalog.ts";
import { catalog as redes } from "../redes/catalog.ts";
import { cross } from "../shared/cross.ts";
import { catalog as so } from "../so/catalog.ts";

const CATALOGS: Record<SiteId, Catalog> = { arq, so, redes };
const ORDER: SiteId[] = ["arq", "so", "redes"];

function sitePct(c: Catalog): number {
  const p = loadProgress(c.site);
  const lessons = visibleLessons(c);
  if (!lessons.length) return 0;
  return Math.round(
    lessons.reduce((a, l) => a + lessonPercent(p.lessons[l.slug], l.steps), 0) / lessons.length,
  );
}

function draw(root: HTMLElement): () => void {
  render(
    root,
    html`<div class="page">${topbarHtml("hub", {})}
      <main class="page-main" id="main" tabindex="-1">
        <section class="hero"><span class="hero-mark">${brandSymbol(48)}</span><h1>${t("brand.hub")}</h1><p>${t("hub.tagline")}</p></section>
        <div class="site-cards">${ORDER.map((id) => {
          const c = CATALOGS[id];
          const pct = sitePct(c);
          return html`<section class="site-card ${id}" aria-labelledby="card-${id}">
            ${siteMark(id, 40)}
            <h2 id="card-${id}">${t(`brand.${id}`)}</h2>
            <p>${c.tagline}</p>
            <div class="actions">${
              visibleLessons(c).length
                ? html`<a class="btn primary" href="${siteUrl(id)}">${pct > 0 ? t("hub.continue") : t("hub.start")}</a>`
                : html`<a class="btn" href="${siteUrl(id)}">${t("hub.soon")}</a>`
            }</div>
            <span class="meta"><span>${t("home.lessons", { n: visibleLessons(c).length })}</span><span>${pct}%</span></span>
          </section>`;
        })}</div>
        ${trailsHtml(cross, null)}
        <section class="group-section"><h2 class="micro">${t("hub.teachers")}</h2><p class="prose">${t("hub.teachersText")}</p></section>
      </main>${footerHtml()}</div>`,
  );
  return bindTopbar(root, { onHelp: openHelp, onLang: (code) => void changeLang(code, () => mount()) });
}

let off: () => void = () => {};
function mount() {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) return;
  off();
  off = draw(root);
  document.title = `${t("brand.hub")} · ${t("hub.tagline")}`;
}

await bootCommon("hub");
mount();
pageShortcuts();
