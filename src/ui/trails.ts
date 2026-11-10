import type { SiteId, Trail } from "../contracts/types.ts";
import { html, type SafeHtml } from "../core/dom.ts";
import { t } from "../core/i18n.ts";
import { lessonStatus, loadProgress } from "../core/progress.ts";
import { lessonUrl } from "../core/router.ts";
import type { CrossSite } from "./site-config.ts";

/** Trail cards: ordered lessons, each marked done, with a link to the first one not done. */
export function trailsHtml(cross: CrossSite | undefined, site: SiteId | null): SafeHtml {
  const trails: Trail[] = cross?.trails(site) ?? [];
  if (!trails.length) return html``;
  const progress = new Map<SiteId, ReturnType<typeof loadProgress>>();
  const done = (ref: string) => {
    const [s, slug] = ref.split("/") as [SiteId, string];
    if (!progress.has(s)) progress.set(s, loadProgress(s));
    return lessonStatus(progress.get(s)?.lessons[slug]) === "done";
  };
  return html`<section class="group-section" aria-labelledby="trails-h"><h2 class="micro" id="trails-h">${t("hub.trails")}</h2>
    <ul class="trails">${trails.map((tr) => {
      const items = tr.items.map((r) => ({ ref: r, link: cross?.title(r), ok: done(r) }));
      const n = items.filter((x) => x.ok).length;
      const nextItem = items.find((x) => !x.ok) ?? items[0];
      return html`<li class="trail">
        <div class="trail-head"><h3>${tr.title}</h3><span class="micro">${t("trail.count", { n, total: items.length })}</span></div>
        <p class="narr-sub">${tr.summary}</p>
        <ol class="trail-steps">${items.map(
          (x) =>
            html`<li data-done="${x.ok}"><a href="${lessonUrl(x.link?.site ?? "redes", x.link?.slug ?? "")}">${x.link?.title ?? x.ref}</a>${
              site && x.link && x.link.site !== site
                ? html` <span class="micro site-tag">${x.link.siteName}</span>`
                : ""
            }</li>`,
        )}</ol>
        ${nextItem?.link ? html`<a class="btn" href="${lessonUrl(nextItem.link.site, nextItem.link.slug)}">${n ? t("trail.continue") : t("trail.start")}</a>` : ""}
      </li>`;
    })}</ul></section>`;
}
