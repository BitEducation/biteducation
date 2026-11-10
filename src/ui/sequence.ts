import type { LessonRun, SceneSpec, TraceEvent } from "../contracts/types.ts";
import { html, render, type SafeHtml } from "../core/dom.ts";
import { t } from "../core/i18n.ts";
import { roleVar } from "./events-table.ts";

type Move = Extract<TraceEvent, { kind: "move" }>;
interface Arrow {
  index: number;
  step: number;
  ev: Move;
}

export interface SequenceView {
  update(cursor: number): void;
  dispose(): void;
}

const ROW = 46;
const SLANT = 18;
const STEP_BAND = 34;
const GUTTER = 76;
const LANE_MIN = 124;

/** Moves between two different nodes: the messages a sequence diagram draws. */
function arrowsOf(run: LessonRun): Arrow[] {
  const stepOf = (i: number) => run.steps.findIndex((s) => i >= s.events[0] && i < s.events[1]);
  const out: Arrow[] = [];
  run.trace.forEach((ev, index) => {
    if (ev.kind === "move" && ev.from !== ev.to) out.push({ index, step: stepOf(index), ev });
  });
  return out;
}

/** Lanes ordered left to right as the nodes sit in the network view. */
function lanesOf(scene: SceneSpec, arrows: Arrow[]) {
  const ids = new Set(arrows.flatMap((a) => [a.ev.from, a.ev.to]));
  return scene.nodes.filter((n) => ids.has(n.id)).sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
}

function arrowHead(x1: number, y1: number, x2: number, y2: number): SafeHtml {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
  const [bx, by] = [x2 - ux * 10, y2 - uy * 10];
  const pts = [
    [x2, y2],
    [bx - uy * 5, by + ux * 5],
    [bx + uy * 5, by - ux * 5],
  ]
    .map(([a, b]) => `${(a as number).toFixed(1)},${(b as number).toFixed(1)}`)
    .join(" ");
  return html`<polygon class="head" points="${pts}"/>`;
}

/** A lesson earns the sequence view when messages travel between at least two nodes. */
export function hasSequence(run: LessonRun, scene: SceneSpec): boolean {
  const arrows = arrowsOf(run);
  return arrows.length >= 2 && lanesOf(scene, arrows).length >= 2;
}

/**
 * Sequence diagram of the same run: one lane per node, one arrow per message, grouped by step.
 * Arrows appear as the player reaches them, like the rows of the events table.
 */
export function createSequenceView(host: HTMLElement, scene: SceneSpec, run: LessonRun): SequenceView {
  const arrows = arrowsOf(run);
  const lanes = lanesOf(scene, arrows);
  const laneIx = new Map(lanes.map((n, i) => [n.id, i]));
  render(
    host,
    html`<div class="seq-scroll"><div class="seq-head" aria-hidden="true">${lanes.map(
      (n) =>
        html`<div class="seq-lane" title="${n.label}${n.sub ? ` · ${n.sub}` : ""}"><b>${n.label}</b>${n.sub ? html`<span>${n.sub}</span>` : ""}</div>`,
    )}</div><svg class="seq-svg" role="img" aria-label="${t("seq.label")}"></svg></div>`,
  );
  const head = host.querySelector(".seq-head") as HTMLElement;
  const scroll = host.querySelector(".seq-scroll") as HTMLElement;
  const svg = host.querySelector("svg") as SVGSVGElement;
  let shown = -1;
  let width = 0;

  const draw = (cursor: number) => {
    // Lanes keep a readable width; past that the diagram scrolls sideways.
    width = Math.max(320, scroll.clientWidth, GUTTER + 16 + lanes.length * LANE_MIN);
    const span = (width - GUTTER - 16) / lanes.length;
    const x = (i: number) => Math.round(GUTTER + span * (i + 0.5));
    head.style.width = `${width}px`;
    head.style.gridTemplateColumns = `${GUTTER}px repeat(${lanes.length}, ${span}px) 16px`;
    const visible = arrows.filter((a) => a.index < cursor);
    const parts: SafeHtml[] = [];
    let y = 12;
    let lastStep = -2;
    visible.forEach((a, k) => {
      if (a.step !== lastStep) {
        const s = run.steps[a.step];
        y += k ? 10 : 0;
        parts.push(
          html`<g class="seq-step"><line x1="8" x2="${width - 8}" y1="${y + 10}" y2="${y + 10}"/><text x="8" y="${y + 4}">${t("seq.step", { n: a.step + 1, title: s?.title ?? "" })}</text></g>`,
        );
        y += STEP_BAND - 6;
        lastStep = a.step;
      }
      const from = laneIx.get(a.ev.from) ?? 0;
      const to = laneIx.get(a.ev.to) ?? 0;
      const x1 = x(from);
      const x2 = x(to);
      const dir = Math.sign(x2 - x1);
      // A lost message stops halfway, like a packet that never arrived.
      const xe = a.ev.lost ? (x1 + x2) / 2 : x2 - dir * 4;
      const ye = a.ev.lost ? y + SLANT / 2 : y + SLANT;
      const label = a.ev.row?.cols.what ?? a.ev.label;
      const when = a.ev.row?.cols.t ?? "";
      const latest = a.index === visible[visible.length - 1]?.index;
      parts.push(
        html`<g class="seq-msg${a.ev.lost ? " lost" : ""}${latest ? " latest" : ""}" data-v="--c:var(--${roleVar(a.ev.role)})">
          ${when ? html`<text class="seq-t" x="${GUTTER - 12}" y="${y + 4}" text-anchor="end">${when}</text>` : ""}
          <circle cx="${x1}" cy="${y}" r="3"/>
          <line x1="${x1}" y1="${y}" x2="${xe}" y2="${ye}"/>
          ${a.ev.lost ? html`<path class="x" d="M${xe - 5} ${ye - 5}l10 10m0-10-10 10"/>` : arrowHead(x1, y, xe, ye)}
          <text class="seq-label" x="${(x1 + xe) / 2}" y="${(y + ye) / 2 - 7}" text-anchor="middle">${label}</text>
        </g>`,
      );
      y += ROW;
    });
    if (!visible.length)
      parts.push(
        html`<text class="seq-empty" x="${width / 2}" y="40" text-anchor="middle">${t("seq.empty")}</text>`,
      );
    const h = Math.max(y + 16, scroll.clientHeight - head.offsetHeight - 2);
    const lifelines = lanes.map(
      (_, i) => html`<line class="seq-life" x1="${x(i)}" x2="${x(i)}" y1="0" y2="${h}"/>`,
    );
    svg.setAttribute("viewBox", `0 0 ${width} ${h}`);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(h));
    render(svg, html`${lifelines}${parts}`);
    const grew = visible.length > shown;
    shown = visible.length;
    if (grew) scroll.scrollTop = scroll.scrollHeight;
  };

  let lastCursor = 0;
  const ro = new ResizeObserver(() => {
    draw(lastCursor);
  });
  ro.observe(scroll);

  return {
    update(cursor) {
      if (cursor === lastCursor && shown >= 0) return;
      lastCursor = cursor;
      draw(cursor);
    },
    dispose() {
      ro.disconnect();
    },
  };
}
