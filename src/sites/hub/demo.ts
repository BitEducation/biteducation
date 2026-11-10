import { html, prefersReducedMotion, render } from "../../core/dom.ts";
import { t } from "../../core/i18n.ts";
import { lessonUrl } from "../../core/router.ts";
import { icons } from "../../ui/icons.ts";
import { createSequenceView } from "../../ui/sequence.ts";
import { catalog as redes } from "../redes/catalog.ts";

const SLUG = "tcp-conexao";
/** Handshake, the window and the lost segment: the first three steps of the lesson. */
const STEPS = 3;
const TICK = 1100;
const HOLD = 3200;

/**
 * Hero excerpt of a real lesson: its own run, drawn as the sequence view, message by message.
 * Loads the lesson on demand so the hub stays light; returns a dispose function.
 */
export function mountDemo(host: HTMLElement): () => void {
  const entry = redes.lessons.find((l) => l.slug === SLUG);
  if (!entry) return () => {};
  let disposed = false;
  let timer = 0;
  let off: () => void = () => {};

  render(
    host,
    html`<figure class="hub-demo tone-redes">
      <div class="demo-bar"><b>${entry.title}</b>
        <button class="icon-btn demo-toggle" type="button" aria-pressed="false" aria-label="${t("hub.demoPause")}" data-tip="${t("hub.demoPause")}" hidden>${icons.pause()}</button></div>
      <div class="demo-stage"><div class="seq-host"></div></div>
      <figcaption>${t("hub.demoCaption", { title: entry.title })} <a href="${lessonUrl("redes", SLUG)}">${t("hub.demoOpen")}</a></figcaption>
    </figure>`,
  );

  void entry.load().then(({ default: lesson }) => {
    if (disposed) return;
    const run = lesson.build(lesson.params.defaults);
    const scene = typeof lesson.scene === "function" ? lesson.scene(lesson.params.defaults) : lesson.scene;
    const seqHost = host.querySelector(".seq-host") as HTMLElement;
    const view = createSequenceView(seqHost, scene, run, { detail: true });
    const end = run.steps[Math.min(STEPS, run.steps.length) - 1]?.events[1] ?? run.trace.length;
    // Cursor stops: just after each message, so every tick adds one arrow.
    const stops = run.trace.flatMap((ev, i) => (ev.kind === "move" && i < end ? [i + 1] : []));
    let k = 0;
    let paused = false;
    const toggle = host.querySelector(".demo-toggle") as HTMLButtonElement;

    const tick = () => {
      if (paused) return;
      k = k >= stops.length ? 1 : k + 1;
      view.update(stops[k - 1] ?? 0);
      timer = window.setTimeout(tick, k >= stops.length ? HOLD : TICK);
    };
    if (prefersReducedMotion() || !stops.length) view.update(end);
    else {
      toggle.hidden = false;
      tick();
    }
    const onToggle = () => {
      paused = !paused;
      toggle.setAttribute("aria-pressed", String(paused));
      const label = paused ? t("hub.demoPlay") : t("hub.demoPause");
      toggle.setAttribute("aria-label", label);
      toggle.dataset.tip = label;
      render(toggle, paused ? icons.play() : icons.pause());
      window.clearTimeout(timer);
      if (!paused) timer = window.setTimeout(tick, 300);
    };
    toggle.addEventListener("click", onToggle);
    off = () => {
      toggle.removeEventListener("click", onToggle);
      view.dispose();
    };
  });

  return () => {
    disposed = true;
    window.clearTimeout(timer);
    off();
  };
}
