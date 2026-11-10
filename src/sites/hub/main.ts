import type { Catalog, SiteId } from "../../contracts/types.ts";
import { html, render } from "../../core/dom.ts";
import { t } from "../../core/i18n.ts";
import { lastVisited, lessonPercent, loadProgress, type Progress } from "../../core/progress.ts";
import { lessonUrl, siteUrl } from "../../core/router.ts";
import { visibleLessons } from "../../core/visibility.ts";
import { bootCommon } from "../../ui/app.ts";
import { openHelp } from "../../ui/help.ts";
import { icons, siteMark } from "../../ui/icons.ts";
import { pageShortcuts } from "../../ui/page-shortcuts.ts";
import { bindTopbar, footerHtml, topbarHtml } from "../../ui/topbar.ts";
import { trailsHtml } from "../../ui/trails.ts";
import { catalog as arq } from "../arq/catalog.ts";
import { catalog as redes } from "../redes/catalog.ts";
import { cross } from "../shared/cross.ts";
import { catalog as so } from "../so/catalog.ts";
import { mountDemo } from "./demo.ts";

const CATALOGS: Record<SiteId, Catalog> = { arq, so, redes };
const ORDER: SiteId[] = ["arq", "so", "redes"];

function sitePct(c: Catalog, p: Progress): number {
  const lessons = visibleLessons(c);
  if (!lessons.length) return 0;
  return Math.round(
    lessons.reduce((a, l) => a + lessonPercent(p.lessons[l.slug], l.steps), 0) / lessons.length,
  );
}

/** One row of the stack: the site in its own color, what it covers and where to pick up. */
function layerHtml(id: SiteId) {
  const c = CATALOGS[id];
  const lessons = visibleLessons(c);
  const p = loadProgress(id);
  const pct = sitePct(c, p);
  const cont = lastVisited(lessons, p);
  const topics = c.groups.filter((g) => lessons.some((l) => l.group === g.id));
  return html`<li class="layer tone-${id}" aria-labelledby="layer-${id}">
    <span class="layer-band" aria-hidden="true">${siteMark(id, 28)}</span>
    <div class="layer-body">
      <h2 id="layer-${id}"><a href="${siteUrl(id)}">${t(`brand.${id}`)}</a></h2>
      <p>${c.tagline}</p>
      ${topics.length ? html`<ul class="layer-topics" aria-label="${t("hub.topics")}">${topics.map((g) => html`<li>${g.title}</li>`)}</ul>` : ""}
    </div>
    <div class="layer-side">
      <div class="layer-count"><span>${t("home.lessons", { n: lessons.length })}</span><span class="tabular">${pct}%</span></div>
      <span class="layer-bar" data-v="--p:${pct}" aria-hidden="true"></span>
      ${
        lessons.length
          ? cont
            ? html`<a class="btn primary" href="${lessonUrl(id, cont.slug, { step: p.lessons[cont.slug]?.lastStep ?? null })}">${icons.play()} ${t("hub.continue")}</a>
              <p class="layer-resume">${t("hub.resume", { title: cont.title })}</p>`
            : html`<a class="btn primary" href="${siteUrl(id)}">${icons.play()} ${t("hub.start")}</a>`
          : html`<a class="btn" href="${siteUrl(id)}">${t("hub.soon")}</a>`
      }
    </div>
  </li>`;
}

function draw(root: HTMLElement): () => void {
  const total = ORDER.reduce((n, id) => n + visibleLessons(CATALOGS[id]).length, 0);
  render(
    root,
    html`<div class="page hub-page">${topbarHtml("hub", {})}
      <main class="page-main" id="main" tabindex="-1">
        <section class="hub-hero hub-hero-split"><div class="hub-hero-text"><h1>${t("hub.title")}</h1><p>${t("hub.lead", { n: total })}</p><p class="hub-note">${t("hub.leadNote")}</p></div><div class="hub-demo-host"></div></section>
        <ol class="layers">${ORDER.map(layerHtml)}</ol>
        ${trailsHtml(cross, null)}
        <section class="group-section" aria-labelledby="teachers-h"><h2 class="micro" id="teachers-h">${t("hub.teachers")}</h2><p class="prose">${t("hub.teachersText")}</p></section>
      </main>${footerHtml()}</div>`,
  );
  const offTop = bindTopbar(root, { onHelp: openHelp });
  const demoHost = root.querySelector<HTMLElement>(".hub-demo-host");
  const offDemo = demoHost ? mountDemo(demoHost) : () => {};
  return () => {
    offDemo();
    offTop();
  };
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
