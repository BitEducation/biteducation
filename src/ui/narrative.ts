import type {
  Fact,
  GlossaryEntry,
  LessonModule,
  LessonRun,
  ParamField,
  Params,
  PracticeItem,
  Quiz,
  Reference,
  TraceEvent,
} from "../contracts/types.ts";
import { html, plainText, richText, type SafeHtml } from "../core/dom.ts";
import { t } from "../core/i18n.ts";
import type { PlayerState } from "../core/player.ts";
import type { LessonProgress } from "../core/progress.ts";
import { BOOKS } from "./books.ts";
import { roleVar } from "./events-table.ts";
import { icons } from "./icons.ts";

export type Tab = "explain" | "facts" | "lab" | "quiz";

export interface NarrativeCtx {
  lesson: LessonModule;
  run: LessonRun;
  state: PlayerState;
  tab: Tab;
  glossary: readonly GlossaryEntry[];
  progress: LessonProgress | undefined;
  params: Params;
  labActive: boolean;
  quizFeedback: { stepId: string; ok: boolean } | null;
  nextLessons: { title: string; url: string }[];
  /** Lessons that help to have seen first (catalog prerequisites). */
  prevLessons: { title: string; url: string }[];
  /** Same idea seen from another site (full page load: no data-nav). */
  related: { title: string; url: string; siteName: string }[];
  untranslated: boolean;
  /** Current generated exercise, when the lesson has any. */
  practice: {
    index: number;
    total: number;
    titles: string[];
    item: PracticeItem;
    fb: { ok: boolean; value: string } | null;
  } | null;
}

function relatedHtml(ctx: NarrativeCtx): SafeHtml {
  if (!ctx.related.length) return html``;
  return html`<section class="side-section"><h3 class="micro">${t("narr.related")}</h3><div class="next-lessons">${ctx.related.map(
    (n) =>
      html`<a class="btn ghost" href="${n.url}"><span>${n.title} <span class="micro site-tag">${n.siteName}</span></span></a>`,
  )}</div></section>`;
}

const termLabel = (g: readonly GlossaryEntry[]) => (id: string) => g.find((e) => e.id === id)?.term ?? null;

export function factsHtml(facts: readonly Fact[]): SafeHtml {
  if (facts.length === 0) return html``;
  return html`<dl class="facts">${facts.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`;
}

function refText(r: Reference): string {
  if ("book" in r) {
    const b = BOOKS[r.book];
    return `${b.authors}, ${b.title}, ${b.edition}, ${typeof r.chapter === "string" ? `apêndice ${r.chapter}` : `cap. ${r.chapter}`}${r.section ? `, §${r.section}` : ""}${r.note ? ` — ${r.note}` : ""}`;
  }
  if ("rfc" in r) return `RFC ${r.rfc}${r.section ? `, §${r.section}` : ""}${r.note ? ` — ${r.note}` : ""}`;
  return `${r.title}${r.note ? ` — ${r.note}` : ""}`;
}

function refsHtml(refs: Reference[]): SafeHtml {
  return html`<section class="side-section"><h3 class="micro">${t("narr.refs")}</h3><ul class="refs">${refs.map(
    (r) => {
      if ("rfc" in r)
        return html`<li><a href="https://www.rfc-editor.org/rfc/rfc${r.rfc}" target="_blank" rel="noopener noreferrer">${refText(r)}</a></li>`;
      if ("url" in r)
        return html`<li><a href="${r.url}" target="_blank" rel="noopener noreferrer">${refText(r)}</a></li>`;
      return html`<li>${refText(r)}${!r.verified && !import.meta.env.PROD ? html` <span class="pill role-warn"><span class="dot"></span>verificar</span>` : ""}</li>`;
    },
  )}</ul></section>`;
}

function eventLine(ev: TraceEvent): string {
  const cols = ev.row?.cols;
  if (cols) return Object.values(cols).join(" · ");
  return ev.label;
}

function nowCard(ctx: NarrativeCtx): SafeHtml {
  const { state, run } = ctx;
  const step = run.steps[state.stepIndex];
  if (!step) return html``;
  const lastIdx = Math.min(state.cursor, step.events[1]) - 1;
  const ev = lastIdx >= step.events[0] ? run.trace[lastIdx] : undefined;
  if (!ev) return html`<div class="now-card"><p>${t("narr.noEvent")}</p></div>`;
  return html`<div class="now-card role-${ev.role}" data-v="--c:var(--${roleVar(ev.role)})">
    <div class="head"><span class="micro">${t("narr.now")}</span>
      ${ev.frame ? html`<button class="btn ghost now-inspect" type="button" data-frame="${ev.frame}">${icons.inspect()} ${t("narr.inspect")}</button>` : ""}</div>
    <b>${ev.label}</b><p>${eventLine(ev)}</p></div>`;
}

function quizHtml(
  stepId: string,
  quiz: Quiz,
  feedback: NarrativeCtx["quizFeedback"],
  glossary: readonly GlossaryEntry[],
): SafeHtml {
  const answered = feedback && feedback.stepId === stepId;
  const body =
    quiz.kind === "choice"
      ? html`<fieldset class="quiz-options"><legend class="sr-only">${quiz.prompt}</legend>${quiz.options.map(
          (o, i) =>
            html`<label class="quiz-opt"><input type="radio" name="quiz" value="${i}" ${answered ? html`disabled` : ""}/> <span>${o}</span></label>`,
        )}</fieldset>`
      : quiz.kind === "pick"
        ? html`${answered ? "" : html`<p class="micro pick-hint">${t("quiz.pickHint")}</p>`}<fieldset class="quiz-options"><legend class="sr-only">${quiz.prompt}</legend>${quiz.targets.map(
            (o) =>
              html`<label class="quiz-opt"><input type="radio" name="quiz" value="${o.id}" ${answered ? html`disabled` : ""}/> <span>${o.label}</span></label>`,
          )}</fieldset>`
        : html`<label class="quiz-num"><span class="micro">${t("quiz.number")}</span>
            <input type="text" name="quiz" autocomplete="off" spellcheck="false" maxlength="24" ${answered ? html`disabled` : ""}/> ${quiz.unit ?? ""}</label>`;
  return html`<form class="quiz" data-step="${stepId}" novalidate>
    <p class="micro">${t("quiz.predict")}</p>
    <p class="quiz-prompt">${richText(quiz.prompt, termLabel(glossary))}</p>
    ${body}
    ${
      answered
        ? html`<div class="quiz-feedback ${feedback.ok ? "ok" : "bad"}" role="status"><b>${feedback.ok ? t("quiz.right") : t("quiz.wrong")}</b> ${richText(quiz.explain, termLabel(glossary))}</div>
          <div class="side-actions"><button class="btn primary quiz-continue" type="button">${icons.play()} ${t("quiz.continue")}</button></div>`
        : html`<div class="side-actions"><button class="btn primary" type="submit">${t("quiz.answer")}</button>
          <button class="btn ghost quiz-skip" type="button">${t("quiz.skip")}</button></div>`
    }
  </form>`;
}

export function checkQuiz(quiz: Quiz, raw: string): boolean {
  if (quiz.kind === "choice") return Number(raw) === quiz.answer;
  if (quiz.kind === "pick") return raw === quiz.answer;
  const v = raw.trim();
  // Accepts decimal (with comma or dot) and hexadecimal (0x…) answers.
  const n = /^0x[0-9a-f]+$/i.test(v) ? Number.parseInt(v.slice(2), 16) : Number(v.replace(",", "."));
  return Number.isFinite(n) && Math.abs(n - quiz.answer) <= (quiz.tolerance ?? 0);
}

function explainTab(ctx: NarrativeCtx): SafeHtml {
  const { lesson, run, state, glossary } = ctx;
  const tl = termLabel(glossary);
  if (state.phase === "overview" || state.stepIndex < 0) {
    return html`<p class="micro narr-label">${t("narr.overview", { n: run.steps.length })}</p>
      <h1 class="lesson-title">${lesson.meta.title}</h1>
      <p class="narr-sub">${lesson.meta.area}</p>
      ${ctx.untranslated ? html`<p class="pill note role-warn"><span class="dot"></span>${t("lang.untranslated")}</p>` : ""}
      <div class="narr-text">${richText(lesson.intro.text, tl)}</div>
      <section class="side-section">${factsHtml(lesson.intro.facts)}</section>
      ${
        ctx.prevLessons.length
          ? html`<section class="side-section"><h3 class="micro">${t("narr.before")}</h3><div class="next-lessons">${ctx.prevLessons.map(
              (n) => html`<a class="btn ghost" href="${n.url}" data-nav>${n.title}</a>`,
            )}</div></section>`
          : ""
      }
      ${relatedHtml(ctx)}
      ${ctx.labActive ? html`<p class="pill role-ctrl"><span class="dot"></span>${t("narr.labActive")}</p>` : ""}
      <p class="narr-sub side-section">${t("narr.start")}</p>
      ${refsHtml(lesson.meta.refs)}`;
  }
  if (state.phase === "done" || state.stepIndex >= run.steps.length) {
    return html`<p class="micro narr-label">${t("narr.done")}</p>
      <h2 class="narr-title">${lesson.outro.title}</h2>
      <div class="narr-text">${richText(lesson.outro.text, tl)}</div>
      <section class="side-section">${factsHtml(lesson.outro.facts(run))}</section>
      ${scoreHtml(ctx)}
      ${ctx.labActive && run.labNotes?.length ? html`<section class="side-section"><h3 class="micro">${t("narr.labNotes")}</h3><ul class="simpl">${run.labNotes.map((n) => html`<li>${n}</li>`)}</ul></section>` : ""}
      ${
        ctx.nextLessons.length
          ? html`<section class="side-section"><h3 class="micro">${t("narr.next")}</h3><div class="next-lessons">${ctx.nextLessons.map(
              (n) => html`<a class="btn" href="${n.url}" data-nav>${n.title}</a>`,
            )}</div></section>`
          : ""
      }
      ${relatedHtml(ctx)}
      <div class="side-actions"><button class="btn primary narr-replay" type="button">${icons.replay()} ${t("controls.replay")}</button>
        ${ctx.practice ? html`<button class="btn go-practice" type="button">${t("practice.go")}</button>` : ""}</div>
      ${refsHtml(lesson.meta.refs)}`;
  }
  const step = run.steps[state.stepIndex];
  if (!step) return html``;
  const quizPending = state.phase === "quiz" && step.quiz;
  return html`<p class="micro narr-label">${t("narr.step", { n: state.stepIndex + 1, total: run.steps.length })}</p>
    <h2 class="narr-title">${step.title}</h2>
    <p class="narr-sub">${step.subtitle}</p>
    ${ctx.labActive ? html`<p class="pill role-ctrl side-section"><span class="dot"></span>${t("narr.labActive")}</p>` : ""}
    ${
      quizPending && step.quiz
        ? html`<div class="side-section">${quizHtml(step.id, step.quiz, ctx.quizFeedback, glossary)}</div>`
        : html`<div class="narr-text">${richText(step.text, tl)}</div>
          ${ctx.quizFeedback && ctx.quizFeedback.stepId === step.id && step.quiz ? html`<div class="side-section">${quizHtml(step.id, step.quiz, ctx.quizFeedback, glossary)}</div>` : ""}
          ${nowCard(ctx)}
          <section class="side-section">${factsHtml(step.facts)}</section>
          <div class="side-actions"><button class="btn ghost narr-copy" type="button">${icons.link()} ${t("narr.copyStep")}</button></div>`
    }`;
}

/** End-of-lesson recap of the predictions, with a way back to the ones that went wrong. */
function scoreHtml(ctx: NarrativeCtx): SafeHtml {
  const quizzes = ctx.run.steps.map((s, i) => ({ s, i })).filter((x) => x.s.quiz);
  const answered = quizzes.filter(({ s }) => ctx.progress?.quiz[s.id]);
  if (!answered.length) return html``;
  const wrong = answered.filter(({ s }) => ctx.progress?.quiz[s.id]?.ok === false);
  return html`<section class="side-section"><h3 class="micro">${t("quiz.yours")}</h3>
    <p class="narr-sub">${t("quiz.score", { ok: answered.length - wrong.length, n: quizzes.length })}</p>
    ${
      wrong.length
        ? html`<p class="narr-sub">${t("quiz.review")}</p><div class="next-lessons">${wrong.map(
            ({ s, i }) =>
              html`<button class="btn ghost quiz-goto" type="button" data-step="${i}">${i + 1}. ${s.title}</button>`,
          )}</div>`
        : ""
    }</section>`;
}

function factsTab(ctx: NarrativeCtx): SafeHtml {
  const step = ctx.run.steps[ctx.state.stepIndex];
  return html`${step ? html`<section><h3 class="micro">${t("narr.facts")} · ${step.title}</h3><div class="side-section">${factsHtml(step.facts)}</div></section>` : ""}
    <section class="side-section"><h3 class="micro">${t("narr.lessonFacts")}</h3><div class="side-section">${factsHtml(ctx.lesson.intro.facts)}</div></section>
    <section class="side-section"><h3 class="micro">${t("narr.simpl")}</h3><ul class="simpl side-section">${ctx.lesson.meta.simplifications.map((s) => html`<li>${s}</li>`)}</ul></section>
    ${refsHtml(ctx.lesson.meta.refs)}`;
}

function fieldHtml(f: ParamField, value: unknown): SafeHtml {
  const id = `lab-${f.key}`;
  const help = f.help ? html`<small id="${id}-help">${f.help}</small>` : "";
  const desc = f.help ? html`aria-describedby="${id}-help"` : "";
  switch (f.kind) {
    case "int":
      return html`<label class="lab-field" for="${id}"><span>${f.label}</span>
        <input id="${id}" name="${f.key}" type="number" inputmode="numeric" min="${f.min}" max="${f.max}" step="${f.step ?? 1}" value="${String(value)}" required ${desc}/>${help}</label>`;
    case "choice":
      return html`<label class="lab-field" for="${id}"><span>${f.label}</span>
        <select id="${id}" name="${f.key}" ${desc}>${f.options.map((o) => html`<option value="${o.value}" ${o.value === value ? html`selected` : ""}>${o.label}</option>`)}</select>${help}</label>`;
    case "bool":
      return html`<label class="lab-field check" for="${id}"><input id="${id}" name="${f.key}" type="checkbox" ${value ? html`checked` : ""} ${desc}/><span>${f.label}</span>${help}</label>`;
    case "text":
      return html`<label class="lab-field" for="${id}"><span>${f.label}</span>
        <textarea id="${id}" name="${f.key}" rows="${f.rows ?? 1}" maxlength="${f.maxLength}" spellcheck="false" autocomplete="off" placeholder="${f.placeholder}" ${desc}>${String(value)}</textarea>${help}</label>`;
    case "list":
      return html`<label class="lab-field" for="${id}"><span>${f.label}</span>
        <textarea id="${id}" name="${f.key}" rows="2" maxlength="400" spellcheck="false" placeholder="${f.placeholder}" ${desc}>${String(value)}</textarea>${help}</label>`;
  }
}

function labTab(ctx: NarrativeCtx): SafeHtml {
  const fields = ctx.lesson.params.fields;
  if (!fields?.length) return html`<p class="narr-sub">${t("lab.none")}</p>`;
  return html`<p class="narr-sub">${t("lab.intro")}</p>
    <form class="lab-form side-section" novalidate>
      ${fields.map((f) => fieldHtml(f, ctx.params[f.key]))}
      <div class="side-actions">
        <button class="btn primary" type="submit">${icons.lab()} ${t("lab.apply")}</button>
        <button class="btn lab-reset" type="button">${t("lab.reset")}</button>
        <button class="btn ghost lab-share" type="button">${icons.link()} ${t("lab.share")}</button>
      </div>
    </form>
    ${ctx.labActive && ctx.run.labNotes?.length ? html`<section class="side-section"><h3 class="micro">${t("narr.labNotes")}</h3><ul class="simpl">${ctx.run.labNotes.map((n) => html`<li>${n}</li>`)}</ul></section>` : ""}
    ${ctx.labActive ? html`<section class="side-section"><h3 class="micro">${t("narr.facts")}</h3>${factsHtml(ctx.lesson.outro.facts(ctx.run))}</section>` : ""}`;
}

/** Answers are shown the way a person writes them: comma decimals, at most 3 places. */
export function formatAnswer(n: number): string {
  return String(Number(n.toFixed(3))).replace(".", ",");
}

function practiceHtml(ctx: NarrativeCtx): SafeHtml {
  const p = ctx.practice;
  if (!p) return html``;
  const tl = termLabel(ctx.glossary);
  const { item, fb } = p;
  return html`<section class="side-section practice" aria-labelledby="practice-h"><h3 class="micro" id="practice-h">${t("practice.title")}</h3>
    <p class="narr-sub">${t("practice.intro")}</p>
    ${
      p.total > 1
        ? html`<div class="practice-kinds" role="group" aria-label="${t("practice.kinds")}">${p.titles.map(
            (title, i) =>
              html`<button class="btn ghost practice-pick" type="button" data-i="${i}" aria-pressed="${i === p.index}">${title}</button>`,
          )}</div>`
        : ""
    }
    <form class="quiz practice-form" novalidate>
      <p class="quiz-prompt">${richText(item.prompt, tl)}</p>
      <label class="quiz-num"><span class="micro">${t("quiz.number")}</span>
        <input type="text" name="practice" autocomplete="off" spellcheck="false" maxlength="24" ${fb ? html`disabled value="${fb.value}"` : ""}/> ${item.unit ?? ""}</label>
      ${
        fb
          ? html`<div class="quiz-feedback ${fb.ok ? "ok" : "bad"}" role="status"><b>${fb.ok ? t("quiz.right") : t("quiz.wrong")}</b> ${t("practice.answer", { v: item.shown ?? formatAnswer(item.answer), u: item.unit ? ` ${item.unit}` : "" })} ${richText(item.explain, tl)}</div>`
          : ""
      }
      <div class="side-actions">
        ${fb ? "" : html`<button class="btn primary" type="submit">${t("practice.check")}</button>`}
        <button class="btn ${fb ? "primary" : "ghost"} practice-next" type="button">${t("practice.next")}</button>
      </div>
    </form></section>`;
}

function quizTab(ctx: NarrativeCtx): SafeHtml {
  const quizzes = ctx.run.steps.map((s, i) => ({ s, i })).filter((x) => x.s.quiz);
  if (quizzes.length === 0)
    return html`${ctx.practice ? "" : html`<p class="narr-sub">${t("quiz.none")}</p>`}${practiceHtml(ctx)}`;
  const tl = termLabel(ctx.glossary);
  return html`${practiceHtml(ctx)}<h3 class="micro">${t("quiz.yours")}</h3>
    <ol class="quiz-list side-section">${quizzes.map(({ s, i }) => {
      const res = ctx.progress?.quiz[s.id];
      return html`<li><button class="btn ghost quiz-goto" type="button" data-step="${i}">${i + 1}. ${s.title}</button>
        <p class="narr-sub">${plainText(s.quiz?.prompt ?? "", tl)}</p>
        <p class="micro ${res ? (res.ok ? "ok" : "bad") : ""}">${res ? (res.ok ? `✓ ${t("quiz.right")}` : `✕ ${t("quiz.wrong")}`) : t("quiz.pending")}</p></li>`;
    })}</ol>
    <div class="side-actions"><button class="btn quiz-redo" type="button">${t("quiz.redo")}</button></div>`;
}

export function narrativeHtml(ctx: NarrativeCtx): SafeHtml {
  switch (ctx.tab) {
    case "explain":
      return explainTab(ctx);
    case "facts":
      return factsTab(ctx);
    case "lab":
      return labTab(ctx);
    case "quiz":
      return quizTab(ctx);
  }
}

export function readLabForm(form: HTMLFormElement, fields: ParamField[]): Params {
  const out: Params = {};
  for (const f of fields) {
    const el = form.elements.namedItem(f.key);
    if (!el) continue;
    if (f.kind === "bool") out[f.key] = (el as HTMLInputElement).checked;
    else if (f.kind === "int") out[f.key] = Number((el as HTMLInputElement).value);
    else if (f.kind === "text") out[f.key] = (el as HTMLTextAreaElement).value.replace(/\r\n?/g, "\n").trim();
    else out[f.key] = (el as HTMLInputElement).value.trim();
  }
  return out;
}
