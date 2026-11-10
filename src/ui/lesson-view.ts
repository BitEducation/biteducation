import type { CatalogEntry, LessonModule, LessonRun, Params, PracticeItem } from "../contracts/types.ts";
import { html, render } from "../core/dom.ts";
import { focusOf } from "../core/focus.ts";
import { t } from "../core/i18n.ts";
import { buildPcap } from "../core/pcap.ts";
import { createPlayer, type PlayerState } from "../core/player.ts";
import {
  getContinuous,
  getEventsHeight,
  getFlag,
  getSpeed,
  getView,
  resolvedTheme,
  type SceneView,
  SPEEDS,
  type Speed,
  setContinuous,
  setEventsHeight,
  setFlag,
  setSpeed,
  setTheme,
  setView,
} from "../core/prefs.ts";
import {
  lessonPercent,
  loadProgress,
  markDone,
  markSeen,
  type Progress,
  recordQuiz,
  saveProgress,
} from "../core/progress.ts";
import { lessonUrl, type Route, sanitizeParams, siteUrl } from "../core/router.ts";
import { reduceScene } from "../core/scene-state.ts";
import { bindShortcuts } from "../core/shortcuts.ts";
import { createStore } from "../core/store.ts";
import { visibleLessons } from "../core/visibility.ts";
import { createSceneRenderer } from "../scene/render.ts";
import { createControls } from "./controls.ts";
import { createEventsTable } from "./events-table.ts";
import { bindGlossary } from "./glossary.ts";
import { openHelp } from "./help.ts";
import { icons } from "./icons.ts";
import { createIndexPanel } from "./index-panel.ts";
import { createInspector } from "./inspector.ts";
import { checkQuiz, narrativeHtml, readLabForm, type Tab } from "./narrative.ts";
import { createSequenceView, hasSequence } from "./sequence.ts";
import type { SiteConfig } from "./site-config.ts";
import { copyText, toast } from "./toast.ts";
import { bindTopbar, syncThemeButton, topbarHtml } from "./topbar.ts";

export interface LessonDeps {
  config: SiteConfig;
  entry: CatalogEntry;
  lesson: LessonModule;
  route: Route;
  tab?: Tab;
  navigate(url: string, opts?: { replace?: boolean; tab?: Tab }): void;
  openSearch(): void;
}

export function sitePercent(config: SiteConfig, progress: Progress): number {
  const lessons = visibleLessons(config.catalog);
  if (!lessons.length) return 0;
  const sum = lessons.reduce((acc, l) => acc + lessonPercent(progress.lessons[l.slug], l.steps), 0);
  return Math.round(sum / lessons.length);
}

const TABS: Tab[] = ["explain", "facts", "lab", "quiz"];

/** Mounts one lesson into root and returns a dispose function. */
export function mountLesson(root: HTMLElement, deps: LessonDeps): () => void {
  const { config, entry, lesson, route } = deps;
  const { catalog, glossary } = config;
  const site = catalog.site;
  const slug = lesson.meta.slug;
  const cleanups: (() => void)[] = [];

  /* ---------- params and run ---------- */
  let params: Params = { ...lesson.params.defaults };
  let labActive = false;
  if (route.lab) {
    const s = sanitizeParams(route.lab, lesson.params.defaults, lesson.params.fields);
    params = s.params;
    labActive = s.changed;
    if (Object.keys(route.lab).some((k) => route.lab?.[k] !== s.params[k])) toast(t("lab.invalid"));
  }
  let run: LessonRun;
  try {
    run = lesson.build(params);
  } catch (err) {
    toast(t("lab.error", { msg: err instanceof Error ? err.message.slice(0, 120) : "?" }));
    params = { ...lesson.params.defaults };
    labActive = false;
    run = lesson.build(params);
  }

  const scene = typeof lesson.scene === "function" ? lesson.scene(params) : lesson.scene;
  let progress = loadProgress(site);
  const answered = new Set<string>();
  let quizFeedback: { stepId: string; ok: boolean } | null = null;
  // Generated exercises: the seed is the only state; the lesson computes the rest.
  const practices = lesson.practice ?? [];
  const newSeed = () => 1 + Math.floor(Math.random() * 1_000_000);
  let practice = { index: 0, seed: newSeed(), fb: null as { ok: boolean; value: string } | null };
  function practiceCtx() {
    const p = practices[practice.index];
    if (!p) return null;
    let item: PracticeItem;
    try {
      item = p.make(practice.seed);
    } catch {
      return null;
    }
    return {
      index: practice.index,
      total: practices.length,
      titles: practices.map((x) => x.title),
      item,
      fb: practice.fb,
    };
  }
  let tab: Tab = deps.tab ?? "explain";
  const group = catalog.groups.find((g) => g.id === entry.group);

  /* ---------- layout ---------- */
  const seqOk = hasSequence(run, scene);
  // ?vista= wins over the saved choice, so a shared link opens the view it was copied from.
  const urlView = new URLSearchParams(location.search).get("vista");
  let view: SceneView = urlView === "sequencia" ? "seq" : urlView === "rede" ? "net" : getView();
  const indexOpen = getFlag("index", true);
  const eventsOpen = getFlag("events", true);
  render(
    root,
    html`<div class="app" data-index="${indexOpen ? "open" : "closed"}" data-events="${eventsOpen ? "open" : "closed"}" data-present="false" data-drawer="closed">
      ${topbarHtml(site, { back: "site", indexToggle: true, progress: sitePercent(config, progress) })}
      <aside class="index" id="lesson-index" aria-label="${t("index.title")}"></aside>
      <div class="scrim"></div>
      <main class="stage" id="main" tabindex="-1">
        ${
          seqOk || labActive
            ? html`<div class="scene-bar">${
                seqOk
                  ? html`<div class="view-switch" role="group" aria-label="${t("view.label")}">${(
                      ["net", "seq"] as const
                    ).map(
                      (v) =>
                        html`<button type="button" data-view="${v}" aria-pressed="${v === view}">${v === "net" ? icons.layers() : icons.list()} ${v === "net" && site !== "redes" ? t("view.diagram") : t(`view.${v}`)}</button>`,
                    )}</div>`
                  : ""
              }${labActive ? html`<span class="pill role-ctrl"><span class="dot"></span>${t("tabs.lab")}</span>` : ""}</div>`
            : ""
        }
        <div class="scene-wrap" data-view="${seqOk ? view : "net"}"><div class="scene-host"></div>${seqOk ? html`<div class="seq-host"></div>` : ""}<p class="sr-only scene-live" aria-live="polite"></p><section class="inspector" hidden aria-label="${t("ins.title")}"></section></div>
        <div class="controls" role="toolbar" aria-label="${t("controls.label")}"></div>
      </main>
      <aside class="side" aria-label="${lesson.meta.title}">
        <div class="tabs" role="tablist">${TABS.map(
          (k) =>
            html`<button role="tab" type="button" id="tab-${k}" data-tab="${k}" aria-controls="side-body" aria-selected="${k === tab}" tabindex="${k === tab ? 0 : -1}">${t(`tabs.${k}`)}</button>`,
        )}</div>
        <div class="side-body" id="side-body" role="tabpanel" tabindex="0" aria-labelledby="tab-${tab}"></div>
      </aside>
      <section class="events" aria-labelledby="events-title">
        <div class="events-head" title="${t("events.resize")}">
          <h2 class="micro" id="events-title">${t("events.title")}</h2>
          <button class="btn ghost ev-copy" type="button">${icons.copy()} ${t("events.copy")}</button>
          ${buildPcap(run) ? html`<button class="btn ghost ev-pcap" type="button">${icons.download()} ${t("events.pcap")}</button>` : ""}
          <button class="icon-btn ev-toggle" type="button" aria-expanded="${eventsOpen}" aria-controls="events-scroll" aria-label="${t("events.toggle")}" data-tip="${t("events.toggle")} (E)">${icons.layers()}</button>
        </div>
        <div class="events-scroll" id="events-scroll"></div>
      </section>
    </div>`,
  );
  const app = root.querySelector(".app") as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => app.querySelector(sel) as T;
  const sideBody = q(".side-body");
  const sceneLive = q(".scene-live");
  const savedH = getEventsHeight();
  if (savedH) app.style.setProperty("--events-h", `${savedH}px`);
  updateCrumbs(-1);

  /* ---------- views ---------- */
  const renderer = createSceneRenderer(
    q(".scene-host"),
    scene,
    `${lesson.meta.title}: ${lesson.meta.summary}`,
  );
  // States the scene can reach: the end of each step, with that step's notes showing.
  renderer.fit([
    reduceScene(scene, run.trace, run.trace.length, run.trace.length),
    ...run.steps.map((st) => reduceScene(scene, run.trace, st.events[1], st.events[0])),
  ]);
  const store = createStore<PlayerState>({
    phase: "overview",
    stepIndex: -1,
    cursor: 0,
    speed: getSpeed(),
    continuous: getContinuous(),
    selected: null,
  });
  const frameOrder: string[] = [];
  for (const ev of run.trace)
    if (ev.frame && run.frames[ev.frame] && !frameOrder.includes(ev.frame)) frameOrder.push(ev.frame);

  // Where each frame travels, from the first move that carries it: context for the inspector
  // when the lesson did not write a "where" line.
  const routes: Record<string, string> = {};
  const nodeLabel = (id: string) => scene.nodes.find((n) => n.id === id)?.label ?? id;
  for (const ev of run.trace)
    if (ev.kind === "move" && ev.frame && !routes[ev.frame])
      routes[ev.frame] = t("ins.route", { from: nodeLabel(ev.from), to: nodeLabel(ev.to) });

  const inspector = createInspector(
    q(".inspector"),
    run.frames,
    frameOrder,
    routes,
    () => closeInspector(),
    (id) => showInspector(id),
  );
  const seqHost = app.querySelector<HTMLElement>(".seq-host");
  const sequence = seqHost ? createSequenceView(seqHost, scene, run) : null;
  const sceneWrap = q(".scene-wrap");
  const onViewClick = (e: MouseEvent) => {
    const b = (e.target as Element).closest<HTMLElement>(".view-switch [data-view]");
    if (!b) return;
    view = b.dataset.view === "seq" ? "seq" : "net";
    setView(view);
    const u = new URL(location.href);
    u.searchParams.set("vista", view === "seq" ? "sequencia" : "rede");
    history.replaceState(history.state, "", u);
    sceneWrap.dataset.view = view;
    for (const x of app.querySelectorAll(".view-switch [data-view]"))
      x.setAttribute("aria-pressed", String((x as HTMLElement).dataset.view === view));
    sequence?.update(store.get().cursor);
  };
  const stageEl = q(".stage");
  stageEl.addEventListener("click", onViewClick);
  const table = createEventsTable(q(".events-scroll"), config.columns, run, (index) => {
    store.set({ selected: index });
    const ev = run.trace[index];
    if (ev?.frame && run.frames[ev.frame]) showInspector(ev.frame);
    else toast(t("ins.none"));
    table.update(store.get().cursor, index);
  });

  const player = createPlayer(scene, run, store, {
    renderState(state, cursor) {
      const step = run.steps[store.get().stepIndex];
      renderer.update(state, focusOf(step, run.trace, scene));
      table.update(cursor, store.get().selected);
      sequence?.update(cursor);
      sceneLive.textContent = renderer.describe(state);
    },
    animate: (ev, _i, speed) => renderer.animate(ev, speed),
    cancelAnimations: () => renderer.cancel(),
    onStepSeen(i) {
      const step = run.steps[i];
      if (step && !labActive && markSeen(progress, slug, step.id)) saveProgress(site, progress);
      refreshProgress();
    },
    onDone() {
      if (!labActive) {
        markDone(
          progress,
          slug,
          run.steps.map((s) => s.id),
        );
        saveProgress(site, progress);
      }
      refreshProgress();
    },
    needsQuiz(i) {
      const step = run.steps[i];
      return Boolean(step?.quiz && !answered.has(step.id));
    },
  });

  const controls = createControls(q(".controls"), run, {
    restart: () => player.restart(),
    prev: () => player.prev(),
    toggle: () => player.toggle(),
    next: () => player.next(),
    stepEvent: () => player.stepEvent(),
    goTo: (i) => player.goTo(i),
    speed: (v) => changeSpeed(v as Speed),
    continuous: (v) => {
      setContinuous(v);
      player.setContinuous(v);
    },
    present: () => togglePresent(),
    fullscreen: () => toggleFullscreen(),
  });

  const index = createIndexPanel(
    q(".index"),
    catalog,
    (i) => {
      closeDrawer();
      player.goTo(i);
    },
    () => toggleIndex(),
  );

  /* ---------- derived UI ---------- */
  function counterText(cursor: number): string | null {
    const c = lesson.counter;
    if (!c) return null;
    let n = 0;
    for (let k = 0; k < cursor; k++) {
      const ev = run.trace[k];
      if (ev && c.test(ev)) n++;
    }
    return n ? c.label(n) : null;
  }

  function prevLessons() {
    const all = visibleLessons(catalog);
    const entry = catalog.lessons.find((l) => l.slug === slug);
    return (entry?.prerequisites ?? [])
      .map((id) => all.find((l) => l.slug === id))
      .filter((l): l is CatalogEntry => Boolean(l))
      .map((l) => ({ title: l.title, url: lessonUrl(site, l.slug) }));
  }

  function nextLessons() {
    const all = visibleLessons(catalog);
    const ids = lesson.next?.length
      ? lesson.next
      : all
          .slice(all.findIndex((l) => l.slug === slug) + 1)
          .slice(0, 1)
          .map((l) => l.slug);
    return ids
      .map((id) => all.find((l) => l.slug === id))
      .filter((l): l is CatalogEntry => Boolean(l))
      .map((l) => ({ title: l.title, url: lessonUrl(site, l.slug) }));
  }

  /** A "pick" prediction can be answered by clicking the node or widget on the diagram. */
  function pendingPick() {
    const s = store.get();
    const step = run.steps[s.stepIndex];
    return s.phase === "quiz" && step?.quiz?.kind === "pick" && !quizFeedback ? step.quiz : null;
  }
  function markPickTargets() {
    const quiz = pendingPick();
    const host = q(".scene-host");
    host.dataset.pick = quiz ? "true" : "false";
    for (const el of host.querySelectorAll<SVGElement>("[data-pickable]"))
      el.removeAttribute("data-pickable");
    for (const target of quiz?.targets ?? [])
      host
        .querySelector<SVGElement>(
          `[data-node="${CSS.escape(target.id)}"], [data-widget="${CSS.escape(target.id)}"]`,
        )
        ?.setAttribute("data-pickable", "true");
  }

  let lastNarr = "";
  function drawNarrative(force = false) {
    const s = store.get();
    // Re-render the lab form only on demand, so typing is never interrupted.
    const key =
      tab === "explain"
        ? `${s.phase}|${s.stepIndex}|${s.cursor}|${JSON.stringify(quizFeedback)}`
        : `${tab}|${s.stepIndex}`;
    if (!force && key === lastNarr) return;
    lastNarr = key;
    render(
      sideBody,
      narrativeHtml({
        lesson,
        run,
        state: s,
        tab,
        glossary,
        progress: progress.lessons[slug],
        params,
        labActive,
        quizFeedback,
        nextLessons: nextLessons(),
        prevLessons: prevLessons(),
        related: (config.cross?.related(site, slug) ?? []).map((r) => ({
          title: r.title,
          siteName: r.siteName,
          url: lessonUrl(r.site, r.slug),
        })),
        practice: practiceCtx(),
      }),
    );
    if (s.phase === "quiz" && tab === "explain")
      sideBody.querySelector<HTMLElement>(".quiz input")?.focus({ preventScroll: true });
    markPickTargets();
  }

  /** Top bar: where the lesson sits among the site's topics, then its steps as pips. */
  function updateCrumbs(stepIndex: number) {
    const crumbs = app.querySelector(".crumbs");
    if (!crumbs) return;
    const step = run?.steps[stepIndex];
    const groups = catalog.groups.filter((g) => visibleLessons(catalog).some((l) => l.group === g.id));
    const gi = groups.findIndex((g) => g.id === group?.id);
    const seen = new Set(progress.lessons[slug]?.seen ?? []);
    render(
      crumbs,
      html`${
        gi >= 0
          ? html`<span class="topic" title="${t("crumbs.topic", { n: gi + 1, total: groups.length, title: group?.title ?? "" })}"><span class="topic-strip" aria-hidden="true">${groups.map(
              (g, i) => html`<span data-on="${i === gi}" data-past="${i < gi}" title="${g.title}"></span>`,
            )}</span><span class="topic-name">${group?.title ?? ""}</span></span>`
          : ""
      }<span class="crumb-lesson"><b>${lesson.meta.title}</b><span class="crumb-meta"><span class="pips" aria-hidden="true">${run.steps.map(
        (st, i) =>
          html`<span data-state="${i === stepIndex ? "current" : seen.has(st.id) ? "seen" : "new"}"></span>`,
      )}</span><span class="crumb-step">${
        step
          ? `${t("controls.step", { n: stepIndex + 1, total: run.steps.length })} · ${step.title}`
          : t("crumbs.overview", { n: run.steps.length })
      }</span></span></span>`,
    );
  }

  function quizPendingSet(): Set<string> {
    const out = new Set<string>();
    for (const s of run.steps) if (s.quiz && !answered.has(s.id)) out.add(s.id);
    return out;
  }

  function refreshProgress() {
    progress = loadProgress(site);
    const pct = sitePercent(config, progress);
    const box = app.querySelector(".site-progress");
    if (box) {
      box.setAttribute("title", t("progress.site", { pct }));
      render(box, html`<span class="ring" data-v="--p:${pct}"></span><span>${pct}%</span>`);
    }
    syncAll(true);
  }

  function syncUrl(s: PlayerState) {
    const step = run.steps[s.stepIndex];
    const url = lessonUrl(site, slug, { step: step?.id ?? null, lab: labActive ? params : null });
    if (`${location.pathname}${location.search}` !== url) history.replaceState(history.state, "", url);
  }

  function syncAll(force = false) {
    const s = store.get();
    const seen = new Set(progress.lessons[slug]?.seen ?? []);
    controls.update(s, seen, quizPendingSet(), counterText(s.cursor));
    index.update({ current: slug, steps: run.steps, stepIndex: s.stepIndex, progress });
    drawNarrative(force);
  }

  cleanups.push(
    store.subscribe(
      (s) => s.stepIndex,
      (i, s) => {
        updateCrumbs(i);
        syncUrl(s);
        if (s.phase !== "quiz")
          quizFeedback = quizFeedback && run.steps[i]?.id === quizFeedback.stepId ? quizFeedback : null;
      },
    ),
    store.subscribe(
      (s) => s.phase,
      (phase) => {
        if (phase === "quiz" && tab !== "explain") setTab("explain");
      },
    ),
    store.subscribe(
      (s) => `${s.phase}|${s.stepIndex}|${s.cursor}|${s.speed}|${s.continuous}|${s.selected}`,
      () => syncAll(),
    ),
  );

  /* ---------- side panel events ---------- */
  function setTab(next: Tab) {
    tab = next;
    for (const b of app.querySelectorAll<HTMLElement>("[role=tab]")) {
      const on = b.dataset.tab === next;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    }
    sideBody.setAttribute("aria-labelledby", `tab-${next}`);
    drawNarrative(true);
  }

  const tablist = q(".tabs");
  tablist.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-tab]");
    if (b) setTab(b.dataset.tab as Tab);
  });
  tablist.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    e.stopPropagation();
    const i = TABS.indexOf(tab) + (e.key === "ArrowRight" ? 1 : -1);
    const next = TABS[(i + TABS.length) % TABS.length] ?? "explain";
    setTab(next);
    app.querySelector<HTMLElement>(`#tab-${next}`)?.focus();
  });

  q(".scene-host").addEventListener(
    "click",
    (e) => {
      const quiz = pendingPick();
      const el = (e.target as Element).closest<SVGElement>("[data-pickable]");
      if (!quiz || !el) return;
      const id = el.dataset.node ?? el.dataset.widget ?? "";
      const radio = sideBody.querySelector<HTMLInputElement>(
        `.quiz input[name=quiz][value="${CSS.escape(id)}"]`,
      );
      if (!radio) return;
      // Answering, not inspecting: keep the click away from the node's own handler.
      e.stopPropagation();
      radio.checked = true;
      sideBody.querySelector<HTMLElement>(".quiz button[type=submit]")?.focus();
    },
    true,
  );

  sideBody.addEventListener("click", (e) => {
    const el = e.target as Element;
    const s = store.get();
    const step = run.steps[s.stepIndex];
    if (el.closest(".quiz-skip") && step) {
      answered.add(step.id);
      quizFeedback = null;
      player.answeredQuiz();
    } else if (el.closest(".quiz-continue") && step) {
      answered.add(step.id);
      player.answeredQuiz();
      if (store.get().phase !== "quiz") drawNarrative(true);
    } else if (el.closest(".narr-replay")) player.restart();
    else if (el.closest(".narr-copy") && step)
      void copyText(absolute(lessonUrl(site, slug, { step: step.id })), t("narr.copied"), t("narr.copyFail"));
    else if (el.closest(".now-inspect")) {
      const id = el.closest<HTMLElement>(".now-inspect")?.dataset.frame;
      if (id) showInspector(id);
    } else if (el.closest(".practice-next")) {
      practice = { index: practice.index, seed: newSeed(), fb: null };
      drawNarrative(true);
      sideBody.querySelector<HTMLElement>(".practice-form input")?.focus();
    } else if (el.closest(".practice-pick")) {
      const i = Number(el.closest<HTMLElement>(".practice-pick")?.dataset.i);
      if (i >= 0 && i < practices.length) practice = { index: i, seed: newSeed(), fb: null };
      drawNarrative(true);
    } else if (el.closest(".go-practice")) {
      setTab("quiz");
      sideBody.querySelector<HTMLElement>(".practice-form input")?.focus();
    } else if (el.closest(".quiz-goto")) {
      setTab("explain");
      player.goTo(Number(el.closest<HTMLElement>(".quiz-goto")?.dataset.step));
    } else if (el.closest(".quiz-redo")) {
      answered.clear();
      quizFeedback = null;
      const first = run.steps.findIndex((x) => x.quiz);
      setTab("explain");
      player.goTo(Math.max(0, first));
    } else if (el.closest(".lab-reset")) deps.navigate(lessonUrl(site, slug), { replace: true, tab: "lab" });
    else if (el.closest(".lab-share")) {
      const form = sideBody.querySelector<HTMLFormElement>(".lab-form");
      if (!form) return;
      const s2 = sanitizeParams(
        readLabForm(form, lesson.params.fields ?? []),
        lesson.params.defaults,
        lesson.params.fields,
      );
      void copyText(
        absolute(lessonUrl(site, slug, { lab: s2.changed ? s2.params : null })),
        t("narr.copied"),
        t("narr.copyFail"),
      );
    }
  });

  sideBody.addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    if (form.classList.contains("practice-form")) {
      const input = form.querySelector<HTMLInputElement>("input[name=practice]");
      const ctx = practiceCtx();
      if (!input || input.value.trim() === "" || !ctx) return;
      practice.fb = {
        ok: checkQuiz({ kind: "number", ...ctx.item }, input.value),
        value: input.value.trim(),
      };
      drawNarrative(true);
      sideBody.querySelector<HTMLElement>(".practice-next")?.focus();
    } else if (form.classList.contains("quiz")) {
      const step = run.steps[store.get().stepIndex];
      if (!step?.quiz) return;
      const input = form.querySelector<HTMLInputElement>(
        "input[name=quiz]:checked, input[name=quiz][type=text]",
      );
      if (!input || input.value === "") return;
      const ok = checkQuiz(step.quiz, input.value);
      if (!labActive) {
        recordQuiz(progress, slug, step.id, ok);
        saveProgress(site, progress);
      }
      quizFeedback = { stepId: step.id, ok };
      drawNarrative(true);
      sideBody.querySelector<HTMLElement>(".quiz-continue")?.focus();
    } else if (form.classList.contains("lab-form")) {
      const fields = lesson.params.fields ?? [];
      const raw = readLabForm(form, fields);
      const s = sanitizeParams(raw, lesson.params.defaults, fields);
      if (fields.some((f) => raw[f.key] !== s.params[f.key])) toast(t("lab.invalid"));
      try {
        lesson.build(s.params);
      } catch (err) {
        toast(t("lab.error", { msg: err instanceof Error ? err.message.slice(0, 120) : "?" }));
        return;
      }
      toast(t("lab.applied"));
      deps.navigate(lessonUrl(site, slug, { lab: s.changed ? s.params : null }), {
        replace: true,
        tab: "lab",
      });
    }
  });

  /* ---------- inspector, index, events, presentation ---------- */
  // On mid-size screens the dissector needs the room: fold the index while it is open and give
  // it back on close, without touching the saved preference.
  let foldedForInspector = false;
  function showInspector(id: string) {
    if (!isNarrow() && root.clientWidth < 1600 && app.dataset.index === "open") {
      app.dataset.index = "closed";
      q(".index-toggle")?.setAttribute("aria-expanded", "false");
      foldedForInspector = true;
    }
    inspector.show(id);
  }
  function closeInspector() {
    inspector.hide();
    store.set({ selected: null });
    if (foldedForInspector && app.dataset.index === "closed") {
      app.dataset.index = "open";
      q(".index-toggle")?.setAttribute("aria-expanded", "true");
    }
    foldedForInspector = false;
  }

  function inspectCurrent() {
    const s = store.get();
    for (let k = Math.min(s.cursor, run.trace.length) - 1; k >= 0; k--) {
      const ev = run.trace[k];
      if (ev?.frame && run.frames[ev.frame]) {
        store.set({ selected: k });
        showInspector(ev.frame);
        return;
      }
    }
    toast(t("ins.none"));
  }

  const isNarrow = () => root.clientWidth < 1200;
  const drawerTargets = () => [q(".topbar"), q(".stage"), q(".side"), q(".events")];
  function openDrawer() {
    app.dataset.drawer = "open";
    for (const el of drawerTargets()) el.inert = true;
    q<HTMLInputElement>(".index-filter").focus();
  }
  function closeDrawer() {
    if (app.dataset.drawer !== "open") return;
    app.dataset.drawer = "closed";
    for (const el of drawerTargets()) el.inert = false;
    q(".index-toggle")?.focus();
  }
  function toggleIndex() {
    if (isNarrow()) {
      if (app.dataset.drawer === "open") closeDrawer();
      else openDrawer();
      return;
    }
    foldedForInspector = false;
    const open = app.dataset.index !== "open";
    app.dataset.index = open ? "open" : "closed";
    q(".index-toggle")?.setAttribute("aria-expanded", String(open));
    setFlag("index", open);
  }
  q(".index-toggle")?.addEventListener("click", toggleIndex);
  q(".scrim").addEventListener("click", closeDrawer);

  function toggleEvents() {
    const open = app.dataset.events !== "open";
    app.dataset.events = open ? "open" : "closed";
    q(".ev-toggle").setAttribute("aria-expanded", String(open));
    setFlag("events", open);
  }
  q(".ev-toggle").addEventListener("click", toggleEvents);
  q(".ev-copy").addEventListener(
    "click",
    () => void copyText(table.toText(store.get().cursor), t("events.copied"), t("narr.copyFail")),
  );

  app.querySelector(".ev-pcap")?.addEventListener("click", () => {
    const pcap = buildPcap(run);
    if (!pcap) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([pcap.bytes], { type: "application/vnd.tcpdump.pcap" }));
    a.download = `${slug}${labActive ? "-lab" : ""}.pcap`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    if (pcap.zeroed) toast(t("events.pcapZeroed", { n: pcap.zeroed }), 4000);
  });

  // Resize the events drawer by dragging its header.
  const head = q(".events-head");
  head.addEventListener("pointerdown", (e) => {
    if ((e.target as Element).closest("button") || app.dataset.events !== "open") return;
    head.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = q(".events").getBoundingClientRect().height;
    let h = startH;
    const move = (ev: PointerEvent) => {
      h = Math.max(120, Math.min(window.innerHeight * 0.7, startH + (startY - ev.clientY)));
      app.style.setProperty("--events-h", `${h}px`);
    };
    const up = () => {
      head.removeEventListener("pointermove", move);
      head.removeEventListener("pointerup", up);
      head.removeEventListener("pointercancel", up);
      if (h !== startH) setEventsHeight(Math.min(900, h));
    };
    head.addEventListener("pointermove", move);
    head.addEventListener("pointerup", up);
    head.addEventListener("pointercancel", up);
  });

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const onMove = () => {
    app.dataset.idle = "false";
    clearTimeout(idleTimer);
    if (app.dataset.present === "true") idleTimer = setTimeout(() => (app.dataset.idle = "true"), 3000);
  };
  document.addEventListener("pointermove", onMove);
  cleanups.push(() => {
    document.removeEventListener("pointermove", onMove);
    clearTimeout(idleTimer);
  });
  function togglePresent() {
    const on = app.dataset.present !== "true";
    app.dataset.present = String(on);
    onMove();
  }
  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  function changeSpeed(v: Speed) {
    setSpeed(v);
    player.setSpeed(v);
  }
  function bumpSpeed(delta: number) {
    const i = SPEEDS.indexOf(store.get().speed as Speed);
    const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + delta))];
    if (next) changeSpeed(next);
  }

  function lessonAt(delta: number) {
    const all = visibleLessons(catalog);
    const i = all.findIndex((l) => l.slug === slug);
    const other = all[i + delta];
    if (other) deps.navigate(lessonUrl(site, other.slug));
  }

  /* ---------- shortcuts ---------- */
  const rtl = () => document.documentElement.dir === "rtl";
  const map: Record<string, (e: KeyboardEvent) => void> = {
    Space: () => player.toggle(),
    k: () => player.toggle(),
    ArrowRight: () => (inspector.isOpen() ? inspector.nav(1) : rtl() ? player.prev() : player.next()),
    ArrowLeft: () => (inspector.isOpen() ? inspector.nav(-1) : rtl() ? player.next() : player.prev()),
    "Shift+ArrowRight": () => player.stepEvent(),
    "Shift+ArrowLeft": () => player.stepEventBack(),
    s: () => controlsContinuous(),
    "-": () => bumpSpeed(-1),
    "=": () => bumpSpeed(1),
    "+": () => bumpSpeed(1),
    r: () => player.restart(),
    Escape: () => {
      if (inspector.isOpen()) closeInspector();
      else if (app.dataset.drawer === "open") closeDrawer();
      else if (app.dataset.present === "true") togglePresent();
      else player.overview();
    },
    i: () => (inspector.isOpen() ? closeInspector() : inspectCurrent()),
    c: () => inspector.isOpen() && inspector.copy(),
    e: () => toggleEvents(),
    l: () => toggleIndex(),
    p: () => togglePresent(),
    f: () => toggleFullscreen(),
    t: () => {
      setTheme(resolvedTheme() === "dark" ? "light" : "dark");
      syncThemeButton(app);
    },
    "Mod+k": () => deps.openSearch(),
    "/": () => deps.openSearch(),
    j: () => lessonAt(1),
    u: () => lessonAt(-1),
    "g h": () => deps.navigate(siteUrl("hub")),
    "?": () => openHelp(),
  };
  for (let n = 1; n <= 9; n++) map[String(n)] = () => n <= run.steps.length && player.goTo(n - 1);
  function controlsContinuous() {
    const v = !store.get().continuous;
    setContinuous(v);
    player.setContinuous(v);
  }
  // Shortcuts must not fire while the drawer traps focus, except Escape.
  cleanups.push(
    bindShortcuts(
      new Proxy(map, {
        get: (target, key: string) =>
          app.dataset.drawer === "open" && key !== "Escape" ? undefined : target[key],
      }),
    ),
  );

  cleanups.push(
    bindTopbar(app, { onHelp: openHelp }),
    bindGlossary(app, glossary),
    () => player.dispose(),
    () => controls.dispose(),
    () => index.dispose(),
    () => sequence?.dispose(),
    () => stageEl.removeEventListener("click", onViewClick),
  );

  /* ---------- initial step ---------- */
  syncAll(true);
  if (route.step) {
    const i = run.steps.findIndex((s) => s.id === route.step);
    if (i >= 0) {
      // A shared link to a quiz step shows the step without blocking on the question,
      // unless it comes from the review list (?prever=1).
      const id = run.steps[i]?.id;
      if (id && !route.ask) answered.add(id);
      player.goTo(i);
    } else toast(t("lesson.badStep"));
  }
  document.title = `${lesson.meta.title} · ${t(`brand.${site}`)}`;

  return () => {
    for (const c of cleanups.reverse()) c();
  };
}

function absolute(path: string): string {
  return new URL(path, location.origin).href;
}
