import type { CatalogEntry, SiteId } from "../contracts/types.ts";
import { html, render } from "../core/dom.ts";
import { t } from "../core/i18n.ts";
import {
  clearProgress,
  dueReviews,
  isProgress,
  lastVisited,
  lessonPercent,
  lessonStatus,
  loadProgress,
  mergeProgress,
  type Progress,
  saveProgress,
} from "../core/progress.ts";
import { lessonUrl } from "../core/router.ts";
import { visibleLessons } from "../core/visibility.ts";
import { BOOKS, COURSES, SITE_BOOKS } from "./books.ts";
import { openHelp } from "./help.ts";
import { icons } from "./icons.ts";
import { ringHtml } from "./index-panel.ts";
import { sitePercent } from "./lesson-view.ts";
import { downloadSite, offlineSupported } from "./offline.ts";
import { type PageDeps, pageShortcuts } from "./page-shortcuts.ts";
import type { SiteConfig } from "./site-config.ts";
import { toast } from "./toast.ts";
import { bindTopbar, footerHtml, topbarHtml } from "./topbar.ts";
import { trailsHtml } from "./trails.ts";

const MAX_IMPORT = 256 * 1024;

/** Predictions to answer again, each opening its step with the question (?prever=1). */
function reviewHtml(site: SiteId, lessons: CatalogEntry[], p: Progress) {
  const due = dueReviews(p).filter((d) => lessons.some((l) => l.slug === d.slug));
  if (!due.length) return "";
  const days = (at: number) => Math.max(1, Math.round((Date.now() - at) / 86_400_000));
  return html`<section class="group-section" aria-labelledby="review-h"><h2 class="micro" id="review-h">${t("review.title")}</h2>
    <p class="narr-sub">${t("review.intro")}</p>
    <ul class="review-list">${due.map((d) => {
      const l = lessons.find((x) => x.slug === d.slug);
      return html`<li><a href="${lessonUrl(site, d.slug, { step: d.stepId, ask: true })}">${l?.title}</a>
        <span class="micro ${d.ok ? "" : "bad"}">${d.ok ? t("review.old", { n: days(d.at) }) : t("review.wrong")}</span></li>`;
    })}</ul></section>`;
}

/** Home of one site: catalog by group, progress and "continue". */
export function mountSiteHome(root: HTMLElement, config: SiteConfig, deps: PageDeps): () => void {
  const { catalog } = config;
  const site = catalog.site;
  const lessons = visibleLessons(catalog);

  let offTop: () => void = () => {};
  const draw = () => {
    offTop();
    const progress = loadProgress(site);
    const cont = lastVisited(lessons, progress);
    const first = lessons[0];
    render(
      root,
      html`<div class="page">${topbarHtml(site, { progress: sitePercent(config, progress) })}
        <main class="page-main" id="main" tabindex="-1">
          <section class="hub-hero site-hero"><h1>${t(`brand.${site}`)}</h1><p>${catalog.tagline}</p>
            ${
              lessons.length
                ? html`<p class="site-count">${t("home.lessons", { n: lessons.length })}${
                    lessons.filter((l) => l.status === "published").length < lessons.length
                      ? html`, ${t("home.published", { n: lessons.filter((l) => l.status === "published").length })}`
                      : ""
                  }</p>`
                : ""
            }
            <div class="continue">${
              cont
                ? html`<a class="btn primary" href="${lessonUrl(site, cont.slug, { step: progress.lessons[cont.slug]?.lastStep ?? null })}">${icons.play()} ${t("home.continue", { title: cont.title })}</a>`
                : first
                  ? html`<a class="btn primary" href="${lessonUrl(site, first.slug)}">${icons.play()} ${t("home.start")}</a>`
                  : html`<p class="empty-note">${t("home.empty")}</p>`
            }</div></section>
          ${reviewHtml(site, lessons, progress)}
          ${trailsHtml(config.cross, site)}
          ${catalog.groups.map((g) => {
            const items = lessons.filter((l) => l.group === g.id);
            if (!items.length) return "";
            return html`<section class="group-section" aria-labelledby="g-${g.id}"><h2 class="micro" id="g-${g.id}">${g.title}</h2>
              <div class="cards">${items.map((l) => {
                const lp = progress.lessons[l.slug];
                return html`<a class="card" href="${lessonUrl(site, l.slug)}"><h3>${l.title}</h3><p>${l.subtitle}</p>
                  <span class="meta"><span>${t(`level.${l.level}`)}</span><span>·</span><span>${t("minutes", { n: l.minutes })}</span>
                  ${l.status !== "published" ? html`<span class="pill role-warn"><span class="dot"></span>${t(`index.${l.status}`)}</span>` : ""}
                  ${ringHtml(lessonPercent(lp, l.steps), lessonStatus(lp))}</span></a>`;
              })}</div></section>`;
          })}
          <section class="group-section" aria-labelledby="refs-h"><h2 class="micro" id="refs-h">${t("home.refs")}</h2>
            <ul class="home-refs">${SITE_BOOKS[site].map((id) => {
              const b = BOOKS[id];
              return html`<li>${b.authors}. <i>${b.title}</i>, ${b.edition} ${b.publisher}.</li>`;
            })}${COURSES[site].map((c) => html`<li><b>${c.code}</b> · ${c.name}. ${c.teacher}, ${c.school}.</li>`)}</ul>
            ${COURSES[site].length ? html`<p class="narr-sub">${t("home.courseNote")}</p>` : ""}</section>
          <section class="group-section" aria-labelledby="your-data"><h2 class="micro" id="your-data">${t("home.yourData")}</h2>
            <div class="side-actions">
              <button class="btn p-export" type="button">${icons.download()} ${t("home.export")}</button>
              <label class="btn p-import">${icons.upload()} ${t("home.import")}<input class="sr-only" type="file" accept="application/json,.json"/></label>
              <button class="btn ghost p-clear" type="button">${icons.trash()} ${t("home.clear")}</button>
              ${import.meta.env?.PROD && offlineSupported() && lessons.length ? html`<button class="btn p-offline" type="button">${icons.download()} ${t("home.offline")}</button>` : ""}
            </div></section>
        </main>${footerHtml()}</div>`,
    );
    offTop = bindTopbar(root, { onHelp: openHelp, onLang: deps.onLang });
  };
  draw();

  const onClick = (e: MouseEvent) => {
    const el = e.target as Element;
    if (el.closest(".p-export")) {
      const blob = new Blob([JSON.stringify(loadProgress(site), null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `biteducation-${site}-progresso.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (el.closest(".p-offline")) {
      const btn = el.closest<HTMLButtonElement>(".p-offline");
      if (!btn || btn.disabled) return;
      btn.disabled = true;
      downloadSite(site)
        .then((ok) => toast(t(ok ? "home.offlineDone" : "home.offlineFail"), 4000))
        .catch(() => toast(t("home.offlineFail"), 4000))
        .finally(() => {
          btn.disabled = false;
        });
    } else if (el.closest(".p-clear")) {
      if (!confirm(t("home.clearConfirm"))) return;
      clearProgress(site);
      toast(t("home.cleared"));
      draw();
    }
  };
  const onChange = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (!input.matches(".p-import input")) return;
    const file = input.files?.[0];
    input.value = "";
    if (!file || file.size > MAX_IMPORT) return toast(t("home.importFail"));
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!isProgress(data)) throw new Error("invalid");
      saveProgress(site, mergeProgress(loadProgress(site), data));
      toast(t("home.imported"));
      draw();
    } catch {
      toast(t("home.importFail"));
    }
  };
  root.addEventListener("click", onClick);
  root.addEventListener("change", onChange);
  const offKeys = pageShortcuts(deps.openSearch);
  document.title = `${t(`brand.${site}`)} · ${catalog.tagline}`;
  return () => {
    root.removeEventListener("click", onClick);
    root.removeEventListener("change", onChange);
    offTop();
    offKeys();
  };
}
