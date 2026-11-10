import type { Catalog, Step } from "../contracts/types.ts";
import { html, render, type SafeHtml } from "../core/dom.ts";
import { t } from "../core/i18n.ts";
import { lessonPercent, lessonStatus, type Progress } from "../core/progress.ts";
import { lessonUrl } from "../core/router.ts";
import { normalize } from "../core/search.ts";
import { visibleLessons } from "../core/visibility.ts";
import { icons } from "./icons.ts";

export interface IndexPanel {
  update(opts: {
    current: string | null;
    steps: readonly Step[];
    stepIndex: number;
    progress: Progress;
  }): void;
  dispose(): void;
}

export function ringHtml(pct: number, status: string): SafeHtml {
  return html`<span class="ring" data-status="${status}" data-v="--p:${Math.round(pct)}" aria-hidden="true"></span>`;
}

/** Left panel: filter, groups and the step list of the current lesson. */
export function createIndexPanel(
  host: HTMLElement,
  catalog: Catalog,
  onStep: (i: number) => void,
  onToggle: () => void,
): IndexPanel {
  render(
    host,
    html`<div class="index-head"><h2 class="micro">${t("index.title")}</h2>
      <button class="icon-btn index-collapse" type="button" aria-label="${t("index.toggle")}" data-tip="${t("index.toggle")} (L)">${icons.sidebar()}</button></div>
      <input class="index-filter" type="search" maxlength="60" placeholder="${t("index.filter")}" aria-label="${t("index.filter")}"/>
      <nav class="index-scroll" aria-label="${t("index.title")}"></nav>`,
  );
  const scroll = host.querySelector(".index-scroll") as HTMLElement;
  const filter = host.querySelector(".index-filter") as HTMLInputElement;
  let last: Parameters<IndexPanel["update"]>[0] | null = null;

  const draw = () => {
    if (!last) return;
    const { current, steps, stepIndex, progress } = last;
    const q = normalize(filter.value.trim());
    const lessons = visibleLessons(catalog).filter(
      (l) => !q || normalize(`${l.title} ${l.subtitle} ${l.tags.join(" ")}`).includes(q),
    );
    render(
      scroll,
      html`${catalog.groups.map((g) => {
        const items = lessons.filter((l) => l.group === g.id);
        if (!items.length) return "";
        return html`<section class="index-group"><h3 class="micro">${g.title}</h3>${items.map((l) => {
          const lp = progress.lessons[l.slug];
          const isCur = l.slug === current;
          const pct = lessonPercent(lp, isCur ? steps.length : l.steps);
          return html`<a class="lesson-link" href="${lessonUrl(catalog.site, l.slug)}" data-nav ${isCur ? html`aria-current="page"` : ""}>
            ${ringHtml(pct, lessonStatus(lp))}
            <span><span class="t">${l.title}${l.status !== "published" ? html`<span class="draft">${t(`index.${l.status}`)}</span>` : ""}</span>
            <span class="s">${l.subtitle} · ${t("minutes", { n: l.minutes })}</span></span></a>
            ${
              isCur && steps.length
                ? html`<ol class="step-list">${steps.map((s, i) => {
                    const seen = lp?.seen.includes(s.id) ?? false;
                    return html`<li><button type="button" data-step="${i}" data-seen="${seen}" ${i === stepIndex ? html`aria-current="step"` : ""}>
                      <span class="n">${seen ? "✓" : i + 1}</span><span>${s.title}</span></button></li>`;
                  })}</ol>`
                : ""
            }`;
        })}</section>`;
      })}`,
    );
  };

  const onClick = (e: MouseEvent) => {
    const el = e.target as Element;
    const step = el.closest<HTMLElement>("[data-step]");
    if (step) onStep(Number(step.dataset.step));
    else if (el.closest(".index-collapse")) onToggle();
  };
  host.addEventListener("click", onClick);
  filter.addEventListener("input", draw);

  return {
    update(opts) {
      const same =
        last &&
        last.current === opts.current &&
        last.stepIndex === opts.stepIndex &&
        last.progress === opts.progress &&
        last.steps === opts.steps;
      last = opts;
      if (!same) draw();
    },
    dispose() {
      host.removeEventListener("click", onClick);
    },
  };
}
