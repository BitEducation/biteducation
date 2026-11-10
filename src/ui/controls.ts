import type { LessonRun } from "../contracts/types.ts";
import { html, render } from "../core/dom.ts";
import { t } from "../core/i18n.ts";
import type { PlayerState } from "../core/player.ts";
import { SPEEDS } from "../core/prefs.ts";
import { icons } from "./icons.ts";
import { bindMenu } from "./menu.ts";

export interface ControlsHandlers {
  restart(): void;
  prev(): void;
  toggle(): void;
  next(): void;
  stepEvent(): void;
  goTo(i: number): void;
  speed(v: number): void;
  continuous(v: boolean): void;
  present(): void;
  fullscreen(): void;
}

export interface Controls {
  update(
    state: PlayerState,
    seen: ReadonlySet<string>,
    quizPending: ReadonlySet<string>,
    counter: string | null,
  ): void;
  dispose(): void;
}

const speedLabel = (v: number) => `${String(v).replace(".", ",")}×`;

/** Playback bar. Rendered once; update() only touches attributes and text. */
export function createControls(host: HTMLElement, run: LessonRun, h: ControlsHandlers): Controls {
  render(
    host,
    html`<button class="icon-btn c-restart" type="button" aria-label="${t("controls.restart")}" data-tip="${t("controls.restart")} (R)">${icons.replay()}</button>
      <button class="icon-btn c-prev" type="button" aria-label="${t("controls.prev")}" data-tip="${t("controls.prev")} (←)">${icons.prev()}</button>
      <button class="btn primary c-play" type="button" aria-keyshortcuts="Space"></button>
      <button class="icon-btn c-next" type="button" aria-label="${t("controls.next")}" data-tip="${t("controls.next")} (→)">${icons.next()}</button>
      <button class="icon-btn c-event" type="button" aria-label="${t("controls.eventNext")}" data-tip="${t("controls.eventNext")} (Shift →)">${icons.stepOne()}</button>
      <div class="rail" role="group" aria-label="${t("controls.rail")}">${run.steps.map(
        (s, i) =>
          html`<button type="button" data-i="${i}" aria-label="${i + 1}. ${s.title}" title="${i + 1}. ${s.title}"></button>`,
      )}</div>
      <span class="step-count" aria-live="polite"></span>
      <span class="counter" hidden></span>
      <div class="speed-box">
        <button class="btn ghost c-speed" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="${t("controls.speed")}"></button>
        <div class="menu speed-menu" role="menu" hidden>${SPEEDS.map(
          (v) =>
            html`<button role="menuitemradio" type="button" data-speed="${v}" aria-checked="false">${speedLabel(v)}</button>`,
        )}</div>
      </div>
      <button class="icon-btn c-mode" type="button" aria-pressed="false" aria-label="${t("controls.mode")}" data-tip="${t("controls.mode")} (S)">${icons.list()}</button>
      <button class="icon-btn c-present" type="button" aria-label="${t("present.toggle")}" data-tip="${t("present.toggle")} (P)">${icons.present()}</button>
      ${typeof document !== "undefined" && document.fullscreenEnabled ? html`<button class="icon-btn c-fullscreen" type="button" aria-label="${t("fullscreen")}" data-tip="${t("fullscreen")} (F)">${icons.fullscreen()}</button>` : ""}`,
  );
  const q = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T;
  const play = q<HTMLButtonElement>(".c-play");
  const count = q(".step-count");
  const counter = q(".counter");
  const speedBtn = q(".c-speed");
  const mode = q(".c-mode");
  const rail = [...host.querySelectorAll<HTMLButtonElement>(".rail button")];
  let current: PlayerState | null = null;

  const onClick = (e: MouseEvent) => {
    const el = (e.target as Element).closest<HTMLElement>("button");
    if (!el) return;
    if (el.classList.contains("c-restart")) h.restart();
    else if (el.classList.contains("c-prev")) h.prev();
    else if (el.classList.contains("c-play")) h.toggle();
    else if (el.classList.contains("c-next")) h.next();
    else if (el.classList.contains("c-event")) h.stepEvent();
    else if (el.classList.contains("c-mode")) h.continuous(!(current?.continuous ?? true));
    else if (el.classList.contains("c-present")) h.present();
    else if (el.classList.contains("c-fullscreen")) h.fullscreen();
    else if (el.dataset.i !== undefined && el.closest(".rail")) h.goTo(Number(el.dataset.i));
  };
  host.addEventListener("click", onClick);
  const unbindSpeed = bindMenu(speedBtn, q(".speed-menu"), (item) => {
    const v = Number(item.dataset.speed);
    if ((SPEEDS as readonly number[]).includes(v)) h.speed(v);
  });

  return {
    update(state, seen, quizPending, counterText) {
      current = state;
      const total = run.steps.length;
      let label: string;
      let icon = icons.play();
      if (state.phase === "playing") {
        label = t("controls.pause");
        icon = icons.pause();
      } else if (state.phase === "overview") label = t("controls.start");
      else if (state.phase === "done") {
        label = t("controls.replay");
        icon = icons.replay();
      } else if (state.phase === "step-end")
        label = state.stepIndex >= total - 1 ? t("controls.outro") : t("controls.next");
      else if (state.phase === "quiz") label = t("quiz.answer");
      else label = t("controls.continue");
      render(play, html`${icon}<span>${label}</span>`);
      play.disabled = state.phase === "quiz";
      play.setAttribute("aria-label", label);

      count.textContent =
        state.stepIndex < 0
          ? t("controls.overview")
          : state.stepIndex >= total
            ? t("controls.outro")
            : t("controls.step", { n: state.stepIndex + 1, total });
      rail.forEach((b, i) => {
        const id = run.steps[i]?.id ?? "";
        b.dataset.state = i === state.stepIndex ? "current" : seen.has(id) ? "seen" : "todo";
        if (i === state.stepIndex) b.setAttribute("aria-current", "step");
        else b.removeAttribute("aria-current");
        if (quizPending.has(id)) b.dataset.quiz = "pending";
        else delete b.dataset.quiz;
      });
      speedBtn.textContent = speedLabel(state.speed);
      for (const item of host.querySelectorAll<HTMLElement>("[data-speed]"))
        item.setAttribute("aria-checked", String(Number(item.dataset.speed) === state.speed));
      mode.setAttribute("aria-pressed", String(state.continuous));
      counter.hidden = !counterText;
      counter.textContent = counterText ?? "";
    },
    dispose() {
      host.removeEventListener("click", onClick);
      unbindSpeed();
    },
  };
}
