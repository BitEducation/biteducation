import type { Role, SceneNode, SceneSpec, TraceEvent, Widget } from "../contracts/types.ts";
import { html, prefersReducedMotion, raw, render, type SafeHtml } from "../core/dom.ts";
import type { SceneState } from "../core/scene-state.ts";
import { fastMode } from "../core/test-hooks.ts";
import {
  linkPoints,
  moveDuration,
  nodeSize,
  type Pt,
  polylineLength,
  roundedPath,
  routeThrough,
  textWidth,
  vertexOffsets,
} from "./geometry.ts";
import { DEVICE_SIZE, isDevice, PICT_SIZE, pictogram } from "./pictograms.ts";

export interface SceneRenderer {
  update(state: SceneState, highlight: readonly string[]): void;
  animate(ev: TraceEvent, speed: number): Promise<void>;
  cancel(): void;
  describe(state: SceneState): string;
  /** Crops the viewBox to what the given states draw, so the drawing fills the canvas. */
  fit(states: readonly SceneState[]): void;
  readonly svg: SVGSVGElement;
}

const n1 = (v: number) => Number(v.toFixed(1));

/** Moves the ends of a link from the node centers to just outside their footprints. */
function trimEnds(pts: Pt[], a: SceneNode, b: SceneNode): Pt[] {
  if (pts.length < 2) return pts;
  const cut = (n: SceneNode, from: Pt, toward: Pt): Pt => {
    const [w, h] = nodeSize(n, pictogram(n.kind) !== "");
    const dx = toward[0] - from[0];
    const dy = toward[1] - from[1];
    const t = Math.min(
      dx ? (w / 2 + 4) / Math.abs(dx) : Infinity,
      dy ? (h / 2 + 4) / Math.abs(dy) : Infinity,
    );
    return t < 1 ? [from[0] + dx * t, from[1] + dy * t] : from;
  };
  const out = [...pts];
  out[0] = cut(a, pts[0] as Pt, pts[1] as Pt);
  const last = pts.length - 1;
  out[last] = cut(b, pts[last] as Pt, pts[last - 1] as Pt);
  return out;
}

function staticLayer(spec: SceneSpec): SafeHtml {
  const zones = (spec.zones ?? []).map(
    (z) => html`<g class="zone tone-${z.tone ?? "user"}" data-zone="${z.id}">
      <rect x="${z.rect.x}" y="${z.rect.y}" width="${z.rect.w}" height="${z.rect.h}" rx="10"/>
      <text x="${z.rect.x + 12}" y="${z.rect.y + 18}">${z.title}</text></g>`,
  );
  // Links stop at the edge of each node: devices have no opaque box to hide the line under.
  const links = (spec.links ?? []).map((l) => {
    const pts = linkPoints(spec, l);
    const a = spec.nodes.find((n) => n.id === l.from);
    const b = spec.nodes.find((n) => n.id === l.to);
    const trimmed = pts && a && b ? trimEnds(pts, a, b) : pts;
    return trimmed
      ? html`<g class="link style-${l.style ?? "solid"}" data-link="${l.id}"><path d="${roundedPath(trimmed)}"/></g>`
      : html``;
  });
  const nodes = spec.nodes.map((n) => {
    const pict = pictogram(n.kind);
    const hasPict = pict !== "";
    const device = isDevice(n.kind);
    const [w, h] = nodeSize(n, hasPict);
    const x = n.at[0] - w / 2;
    const y = n.at[1] - h / 2;
    // Equipment stands free on the grid, drawn large; components keep their box.
    const ps = device ? DEVICE_SIZE : PICT_SIZE;
    const tx = hasPict ? x + (device ? 4 : 8) + ps + 10 : n.at[0];
    const anchor = hasPict ? "start" : "middle";
    const ty = n.sub ? n.at[1] - 3 : n.at[1] + 4;
    const scale = ps / PICT_SIZE;
    return html`<g class="node kind-${n.kind}${device ? " device" : ""}" data-node="${n.id}" data-hidden="${n.hidden ? "true" : "false"}" role="button" tabindex="-1" aria-label="${n.label}${n.sub ? `, ${n.sub}` : ""}">
      <rect class="halo" x="${x - 5}" y="${y - 5}" width="${w + 10}" height="${h + 10}" rx="10"/>
      <rect class="box" x="${x}" y="${y}" width="${w}" height="${h}" rx="6"/>
      ${hasPict ? html`<g class="pict" transform="translate(${x + (device ? 4 : 8)} ${n1(n.at[1] - ps / 2)}) scale(${n1(scale * 100) / 100})">${raw(pict)}</g>` : ""}
      <text class="label" x="${tx}" y="${ty}" text-anchor="${anchor}">${n.label}</text>
      ${n.sub ? html`<text class="sub" x="${tx}" y="${ty + 16}" text-anchor="${anchor}">${n.sub}</text>` : ""}
      <text class="state" x="${n.at[0]}" y="${y + h + 15}" text-anchor="middle"></text>
    </g>`;
  });
  const widgets = (spec.widgets ?? []).map(
    (w) =>
      html`<g class="widget kind-${w.kind}" data-widget="${w.id}" data-highlight="false"><rect class="w-halo" x="0" y="0" width="0" height="0" rx="8"/>${widgetFrame(w)}<g class="dyn"></g></g>`,
  );
  return html`<g class="l-zones">${zones}</g><g class="l-links">${links}</g><g class="l-widgets">${widgets}</g><g class="l-nodes">${nodes}</g><g class="l-tokens"></g><g class="l-notes"></g>`;
}

/* ---------- widgets ---------- */

const QS = { w: 78, h: 28, gap: 4 };
const GRID_H = 30;
const ROW_H = 24;
const LANE_H = 24;
const LANE_LABEL = 92;
const PIPE_LABEL = 58;

function widgetFrame(w: Widget): SafeHtml {
  const [x, y] = w.at;
  const title = html`<text class="w-title" x="${x}" y="${y - 8}">${w.title}</text>`;
  switch (w.kind) {
    case "queue": {
      const slots = Array.from(
        { length: w.capacity },
        (_, i) =>
          html`<rect class="slot" x="${x + i * (QS.w + QS.gap)}" y="${y}" width="${QS.w}" height="${QS.h}" rx="4"/>`,
      );
      return html`${title}${slots}`;
    }
    case "grid": {
      const cw = w.cellW ?? 58;
      const out: SafeHtml[] = [title];
      for (let r = 0; r < w.rows; r++)
        for (let c = 0; c < w.cols; c++) {
          const i = r * w.cols + c;
          const cx = x + c * (cw + 4);
          const cy = y + r * (GRID_H + 16);
          if (w.indexLabel !== "none")
            out.push(
              html`<text class="idx" x="${cx + 3}" y="${cy + GRID_H + 11}">${
                w.indexLabel === "hex"
                  ? `0x${i.toString(16).toUpperCase()}`
                  : w.indexLabel === "bit"
                    ? w.rows * w.cols - 1 - i
                    : i
              }</text>`,
            );
        }
      return html`${out}`;
    }
    case "table": {
      let cx = x;
      const heads = w.columns.map((c, i) => {
        const t = html`<text class="head-text" x="${cx + 6}" y="${y + 15}">${c}</text>`;
        cx += w.widths[i] ?? 60;
        return t;
      });
      const total = w.widths.reduce((a, b) => a + b, 0);
      return html`${title}<rect class="slot" x="${x}" y="${y}" width="${total}" height="${ROW_H - 2}" rx="4"/>${heads}`;
    }
    case "gantt": {
      const scale = (w.width - LANE_LABEL) / w.span;
      const lanes = w.lanes.map(
        (l, i) => html`<text class="head-text" x="${x}" y="${y + i * (LANE_H + 6) + 16}">${l}</text>
          <rect class="slot" x="${x + LANE_LABEL}" y="${y + i * (LANE_H + 6)}" width="${w.width - LANE_LABEL}" height="${LANE_H}" rx="3"/>`,
      );
      const baseY = y + w.lanes.length * (LANE_H + 6) + 2;
      const step = w.span <= 20 ? 1 : w.span <= 40 ? 2 : 5;
      const ticks: SafeHtml[] = [];
      for (let t = 0; t <= w.span; t += step)
        ticks.push(
          html`<text class="tick" x="${n1(x + LANE_LABEL + t * scale)}" y="${baseY + 11}" text-anchor="middle">${t}</text>`,
        );
      return html`${title}${lanes}${ticks}`;
    }
    case "pipeline": {
      const cw = w.cellW ?? 46;
      const rows = w.stages.map(
        (s, i) => html`<text class="head-text" x="${x}" y="${y + 18 + i * (GRID_H + 4) + 18}">${s}</text>`,
      );
      const cols = Array.from(
        { length: w.cycles },
        (_, c) =>
          html`<text class="tick" x="${x + PIPE_LABEL + c * (cw + 3) + cw / 2}" y="${y + 10}" text-anchor="middle">${c + 1}</text>`,
      );
      return html`${title}${rows}${cols}`;
    }
    case "counter":
      return html`${title}<rect class="slot" x="${x}" y="${y}" width="110" height="40" rx="6"/>`;
    case "chart": {
      const tx: SafeHtml[] = [];
      for (let i = 0; i <= 4; i++) {
        const v = Math.round((w.y.max * i) / 4);
        tx.push(
          html`<text class="tick" x="${x - 6}" y="${n1(y + w.height - (w.height * i) / 4 + 3)}" text-anchor="end">${v}</text>`,
        );
      }
      return html`${title}
        <path class="axis" d="M${x},${y} V${y + w.height} H${x + w.width}"/>
        ${tx}
        <text class="tick" x="${x + w.width}" y="${y + w.height + 14}" text-anchor="end">${w.x.label}</text>
        <text class="tick" x="${x + 4}" y="${y + 8}">${w.y.label}</text>`;
    }
  }
}

function pill(x: number, y: number, w: number, h: number, label: string, role: Role, extra = ""): SafeHtml {
  return html`<g class="item role-${role} ${extra}" data-key="${label}"><rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${h}" rx="${h / 2}"/>
    <text x="${n1(x + w / 2)}" y="${n1(y + h / 2 + 4)}" text-anchor="middle">${label}</text></g>`;
}

function widgetDynamic(w: Widget, s: SceneState): SafeHtml {
  const [x, y] = w.at;
  switch (w.kind) {
    case "queue": {
      const items = s.queues[w.id] ?? [];
      return html`${items.slice(0, w.capacity).map((it, i) => pill(x + i * (QS.w + QS.gap) + 2, y + 3, QS.w - 4, QS.h - 6, it.item, it.role))}
        ${items.length > w.capacity ? html`<text class="tick" x="${x + w.capacity * (QS.w + QS.gap)}" y="${y + 18}">+${items.length - w.capacity}</text>` : ""}`;
    }
    case "grid": {
      const cw = w.cellW ?? 58;
      const cells = s.grids[w.id] ?? {};
      const out: SafeHtml[] = [];
      for (let i = 0; i < w.rows * w.cols; i++) {
        const c = cells[i];
        const cx = x + (i % w.cols) * (cw + 4);
        const cy = y + Math.floor(i / w.cols) * (GRID_H + 16);
        out.push(html`<g class="cell${c?.value ? ` role-${c.role} filled` : ""}" data-key="c${i}" data-mark="${c?.mark ?? ""}" data-val="${c?.value ?? ""}">
          <rect class="slot" x="${cx}" y="${cy}" width="${cw}" height="${GRID_H}" rx="4"/>
          <text class="cell-text" x="${cx + cw / 2}" y="${cy + 19}" text-anchor="middle">${c?.value ?? ""}</text></g>`);
      }
      return html`${out}`;
    }
    case "table": {
      const rows = s.tables[w.id] ?? {};
      const total = w.widths.reduce((a, b) => a + b, 0);
      const out: SafeHtml[] = [];
      for (let r = 0; r < w.rows; r++) {
        const row = rows[r];
        const ry = y + (r + 1) * ROW_H;
        let cx = x;
        const cells = (row?.cells ?? []).map((c, i) => {
          const t = html`<text class="cell-text" x="${cx + 6}" y="${ry + 15}">${c}</text>`;
          cx += w.widths[i] ?? 60;
          return t;
        });
        out.push(html`<g class="row" data-key="r${r}" data-mark="${row?.mark ?? ""}" data-val="${(row?.cells ?? []).join("|")}">
          <rect class="slot" x="${x}" y="${ry}" width="${total}" height="${ROW_H - 2}" rx="3"/>${cells}</g>`);
      }
      return html`${out}`;
    }
    case "gantt": {
      const scale = (w.width - LANE_LABEL) / w.span;
      return html`${s.gantt
        .filter((b) => (b.gantt === undefined || b.gantt === w.id) && w.lanes.includes(b.lane))
        .map((b) => {
          const li = w.lanes.indexOf(b.lane);
          const bx = x + LANE_LABEL + b.from * scale;
          const bw = Math.max(2, (b.to - b.from) * scale - 1);
          const by = y + li * (LANE_H + 6) + 2;
          return html`<g class="role-${b.role}" data-key="g${b.gantt ?? ""}${b.lane}-${b.from}"><rect class="bar" x="${n1(bx)}" y="${by}" width="${n1(bw)}" height="${LANE_H - 4}" rx="3"/>
            ${bw > 18 ? html`<text class="bar-text" x="${n1(bx + bw / 2)}" y="${by + 14}" text-anchor="middle">${b.item}</text>` : ""}</g>`;
        })}`;
    }
    case "pipeline": {
      const cw = w.cellW ?? 46;
      const cycles = s.stages[w.id] ?? {};
      const out: SafeHtml[] = [];
      for (const [cycStr, col] of Object.entries(cycles)) {
        const c = Number(cycStr) - 1;
        if (c < 0 || c >= w.cycles) continue;
        col.stages.forEach((label, si) => {
          const cx = x + PIPE_LABEL + c * (cw + 3);
          const cy = y + 18 + si * (GRID_H + 4);
          const mark = col.marks[si] ?? (label ? "" : "");
          out.push(html`<g class="cell" data-key="p${c}-${si}" data-mark="${mark}" data-val="${label ?? ""}">
            <rect class="slot" x="${cx}" y="${cy}" width="${cw}" height="${GRID_H}" rx="3"/>
            <text class="cell-text" x="${cx + cw / 2}" y="${cy + 19}" text-anchor="middle">${label ?? ""}</text></g>`);
        });
      }
      return html`${out}`;
    }
    case "counter": {
      const v = s.counters[w.id] ?? "";
      // 110px slot: long values ("supervisor (S)") switch to a smaller size to stay inside.
      const size = v.length > 14 ? "xs" : v.length > 8 ? "sm" : "";
      return html`<g data-key="k" data-val="${v}"><text class="counter-text ${size}" x="${x + 55}" y="${y + 26}" text-anchor="middle">${v}</text></g>`;
    }
    case "chart": {
      const series = s.plots[w.id] ?? {};
      return html`${Object.entries(series).map(([name, se]) => {
        const pts = se.points
          .map(
            ([px, py]) =>
              `${n1(x + (px / w.x.max) * w.width)},${n1(y + w.height - (py / w.y.max) * w.height)}`,
          )
          .join(" ");
        const lastPt = se.points[se.points.length - 1];
        return html`<g class="role-${se.role}" data-key="s${name}"><polyline class="series" points="${pts}"/>
          ${lastPt ? html`<text class="tick" x="${n1(x + (lastPt[0] / w.x.max) * w.width + 4)}" y="${n1(seriesLabelY(y + w.height - (lastPt[1] / w.y.max) * w.height, y))}">${name}</text>` : ""}</g>`;
      })}`;
    }
  }
}

/** Series name sits above its last point, or below it when the point is at the top (the title is there). */
function seriesLabelY(py: number, top: number): number {
  return py - 4 < top + 12 ? py + 13 : py - 4;
}

/* ---------- renderer ---------- */

export function createSceneRenderer(host: HTMLElement, spec: SceneSpec, label: string): SceneRenderer {
  const [vw, vh] = spec.viewBox;
  render(
    host,
    html`<svg class="scene-svg" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="xMidYMid meet" role="group" aria-roledescription="cena" aria-label="${label}">${staticLayer(spec)}</svg>`,
  );
  const svg = host.querySelector("svg") as SVGSVGElement;
  const tokens = svg.querySelector(".l-tokens") as SVGGElement;
  const notesLayer = svg.querySelector(".l-notes") as SVGGElement;
  const nodeEls = new Map<string, SVGGElement>();
  for (const el of svg.querySelectorAll<SVGGElement>("[data-node]")) nodeEls.set(el.dataset.node ?? "", el);
  // links take a tone from a "state" event that targets their id (e.g. a failed link)
  const linkEls = new Map<string, SVGGElement>();
  for (const el of svg.querySelectorAll<SVGGElement>("[data-link]")) linkEls.set(el.dataset.link ?? "", el);
  const widgetEls = new Map<string, SVGGElement>();
  const widgetBoxes = new Map<string, SVGGElement>();
  for (const el of svg.querySelectorAll<SVGGElement>("[data-widget]")) {
    widgetEls.set(el.dataset.widget ?? "", el.querySelector(".dyn") as SVGGElement);
    widgetBoxes.set(el.dataset.widget ?? "", el);
  }
  /** Draws the halo around a highlighted widget; measured after render, since rows grow it. */
  function haloWidget(el: SVGGElement, on: boolean) {
    el.dataset.highlight = on ? "true" : "false";
    if (!on) return;
    const halo = el.querySelector<SVGRectElement>(".w-halo");
    if (!halo) return;
    // Measured without the halo itself, or it would grow on every update.
    halo.setAttribute("display", "none");
    try {
      const b = el.getBBox();
      halo.removeAttribute("display");
      if (!b.width) return;
      halo.setAttribute("x", String(n1(b.x - 6)));
      halo.setAttribute("y", String(n1(b.y - 6)));
      halo.setAttribute("width", String(n1(b.width + 12)));
      halo.setAttribute("height", String(n1(b.height + 12)));
    } catch {
      // No layout engine (tests): the highlight still shows through data-highlight.
      halo.removeAttribute("display");
    }
  }
  let running: Animation[] = [];
  let prevVals = new Map<string, string>();

  function nodePos(id: string): Pt | null {
    const n = spec.nodes.find((x) => x.id === id);
    if (n) return n.at;
    const w = spec.widgets?.find((x) => x.id === id);
    return w ? [w.at[0] + 60, w.at[1]] : null;
  }

  function flashChanged() {
    const next = new Map<string, string>();
    for (const [wid, dyn] of widgetEls)
      for (const el of dyn.querySelectorAll<SVGGElement>("[data-key]")) {
        const k = `${wid}:${el.dataset.key}`;
        const v = el.dataset.val ?? "∅";
        next.set(k, v);
        const before = prevVals.get(k);
        if (!prefersReducedMotion() && before !== v && v !== "" && v !== "∅") {
          running.push(
            el.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 260, easing: "ease-out" }),
          );
        }
      }
    prevVals = next;
  }

  const api: SceneRenderer = {
    svg,
    fit(states) {
      // Lessons lay out on a fixed canvas (often 960 wide) and use part of it; measuring every
      // step's end state catches rows, notes and state labels that only appear later.
      const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      const grow = () => {
        for (const g of svg.querySelectorAll<SVGGElement>(
          ".l-zones, .l-links, .l-widgets, .l-nodes, .l-notes",
        )) {
          let b: DOMRect;
          try {
            b = g.getBBox();
          } catch {
            return; // no layout engine (tests)
          }
          if (!b.width && !b.height) continue;
          box.x0 = Math.min(box.x0, b.x);
          box.y0 = Math.min(box.y0, b.y);
          box.x1 = Math.max(box.x1, b.x + b.width);
          box.y1 = Math.max(box.y1, b.y + b.height);
        }
      };
      for (const st of states) {
        api.update(st, []);
        grow();
      }
      prevVals = new Map();
      if (!Number.isFinite(box.x0)) return;
      const pad = 20;
      // Never grows past the authored canvas: notes clamp to it.
      const x = Math.max(0, box.x0 - pad);
      const y = Math.max(0, box.y0 - pad);
      const w = Math.min(vw, box.x1 + pad) - x;
      const h = Math.min(vh, box.y1 + pad) - y;
      if (w > 0 && h > 0) svg.setAttribute("viewBox", `${n1(x)} ${n1(y)} ${n1(w)} ${n1(h)}`);
    },
    update(state, highlight) {
      for (const [id, el] of nodeEls) {
        const ns = state.nodes[id];
        el.dataset.hidden = ns?.visible === false ? "true" : "false";
        el.dataset.tone = ns?.tone ?? "none";
        el.dataset.highlight = highlight.includes(id) ? "true" : "false";
        const st = el.querySelector(".state");
        if (st) st.textContent = ns?.text ?? "";
      }
      // A link to a node that is not on stage yet stays hidden with it.
      const hidden = (id: string) => {
        const ns = state.nodes[id];
        return ns ? ns.visible === false : spec.nodes.find((n) => n.id === id)?.hidden === true;
      };
      for (const [id, el] of linkEls) {
        el.dataset.tone = state.nodes[id]?.tone ?? "none";
        const l = spec.links?.find((x) => x.id === id);
        el.dataset.hidden = l && (hidden(l.from) || hidden(l.to)) ? "true" : "false";
      }
      for (const w of spec.widgets ?? []) {
        const dyn = widgetEls.get(w.id);
        if (dyn) render(dyn, widgetDynamic(w, state));
        const box = widgetBoxes.get(w.id);
        if (box) haloWidget(box, highlight.includes(w.id));
      }
      // notes of the current step
      const notes = state.notes.map((nt, i) => {
        const p = nodePos(nt.at);
        if (!p) return html``;
        const target = spec.nodes.find((n) => n.id === nt.at);
        const h = target ? nodeSize(target)[1] : 0;
        const w = Math.min(320, textWidth(nt.text, 12.5, false) + 22);
        const nx = Math.max(4, Math.min(vw - w - 4, p[0] - w / 2));
        const ny = Math.max(4, p[1] - h / 2 - 36 - (i % 2) * 0);
        return html`<g class="note tone-${nt.tone}"><rect x="${n1(nx)}" y="${n1(ny)}" width="${n1(w)}" height="26" rx="6"/>
          <text x="${n1(nx + w / 2)}" y="${n1(ny + 17)}" text-anchor="middle">${nt.text}</text></g>`;
      });
      render(notesLayer, html`${notes}`);
      flashChanged();
    },
    animate(ev, speed) {
      if (fastMode()) return Promise.resolve();
      if (ev.kind !== "move") return wait(ev.kind === "note" ? 420 : 260, speed);
      const pts = routeThrough(spec, [ev.from, ...(ev.via ?? []), ev.to]);
      if (!pts) return wait(200, speed);
      const len = polylineLength(pts);
      const label = ev.label;
      const w = Math.max(34, textWidth(label, 12) + 18);
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", `token role-${ev.role}${ev.lost ? " lost" : ""}`);
      render(
        g,
        html`<rect x="${n1(-w / 2)}" y="-11" width="${n1(w)}" height="22" rx="11"/><text x="0" y="4" text-anchor="middle">${label}</text>`,
      );
      tokens.append(g);
      const start = pts[0] as Pt;
      if (prefersReducedMotion()) {
        const end = (ev.lost ? pts[Math.floor(pts.length / 2)] : pts[pts.length - 1]) as Pt;
        g.setAttribute("transform", `translate(${end[0]} ${end[1]})`);
        const a = g.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 1 }, { opacity: 0 }], {
          duration: 500 / speed,
        });
        running.push(a);
        return a.finished.then(
          () => g.remove(),
          () => g.remove(),
        );
      }
      const frames: Keyframe[] = [];
      if (ev.lost) {
        // travel 55% of the way, then drop and fade: the packet never arrives
        const offsets = vertexOffsets(pts);
        const cut = 0.55;
        pts.forEach((p, i) => {
          const off = offsets[i] ?? 0;
          if (off < cut)
            frames.push({
              offset: (off / cut) * 0.6,
              transform: `translate(${n1(p[0])}px, ${n1(p[1])}px)`,
              opacity: 1,
            });
        });
        const mid = pointAt(pts, cut);
        frames.push({ offset: 0.6, transform: `translate(${n1(mid[0])}px, ${n1(mid[1])}px)`, opacity: 1 });
        frames.push({
          offset: 1,
          transform: `translate(${n1(mid[0])}px, ${n1(mid[1] + 16)}px) rotate(18deg)`,
          opacity: 0,
        });
      } else {
        const offsets = vertexOffsets(pts);
        pts.forEach((p, i) => {
          frames.push({
            offset: (offsets[i] ?? 0) * 0.94,
            transform: `translate(${n1(p[0])}px, ${n1(p[1])}px)`,
            opacity: 1,
          });
        });
        const end = pts[pts.length - 1] as Pt;
        frames.push({ offset: 1, transform: `translate(${n1(end[0])}px, ${n1(end[1])}px)`, opacity: 0 });
      }
      if (frames.length > 0 && frames[0]?.offset !== 0)
        frames.unshift({ offset: 0, transform: `translate(${start[0]}px, ${start[1]}px)`, opacity: 1 });
      const a = g.animate(frames, {
        duration: moveDuration(len, speed),
        easing: "cubic-bezier(.3,.7,.2,1)",
        fill: "forwards",
      });
      running.push(a);
      return a.finished.then(
        () => {
          g.remove();
          if (!ev.lost) pulse(ev.to);
        },
        () => g.remove(),
      );
    },
    cancel() {
      for (const a of running) a.cancel();
      running = [];
      tokens.replaceChildren();
    },
    describe(state) {
      const parts: string[] = [];
      for (const n of spec.nodes) {
        const ns = state.nodes[n.id];
        if (ns?.visible === false) continue;
        parts.push(`${n.label}${ns?.text ? `: ${ns.text}` : ""}`);
      }
      for (const w of spec.widgets ?? []) {
        if (w.kind === "queue")
          parts.push(`${w.title}: ${(state.queues[w.id] ?? []).map((q) => q.item).join(", ") || "vazia"}`);
        if (w.kind === "counter" && state.counters[w.id]) parts.push(`${w.title}: ${state.counters[w.id]}`);
      }
      for (const nt of state.notes) parts.push(`Nota: ${nt.text}`);
      return parts.join(". ");
    },
  };

  function pulse(id: string) {
    const node = nodeEls.get(id);
    if (!node || prefersReducedMotion()) return;
    if (node.classList.contains("device")) {
      const pict = node.querySelector(".pict");
      if (pict)
        running.push(
          pict.animate([{ opacity: 0.45 }, { opacity: 1 }], { duration: 300, easing: "ease-out" }),
        );
      return;
    }
    const el = node.querySelector(".box");
    if (!el) return;
    running.push(
      el.animate([{ strokeWidth: "3.5" }, { strokeWidth: "1.25" }], { duration: 300, easing: "ease-out" }),
    );
  }

  function wait(ms: number, speed: number): Promise<void> {
    if (prefersReducedMotion()) ms = Math.min(ms, 120);
    return new Promise((resolve) => {
      const a = tokens.animate([{ opacity: 1 }, { opacity: 1 }], { duration: ms / speed });
      running.push(a);
      a.finished.then(
        () => resolve(),
        () => resolve(),
      );
    });
  }
  return api;
}

function pointAt(pts: readonly Pt[], frac: number): Pt {
  const total = polylineLength(pts);
  let target = total * frac;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1] as Pt;
    const q = pts[i] as Pt;
    const seg = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (target <= seg) {
      const r = seg === 0 ? 0 : target / seg;
      return [p[0] + (q[0] - p[0]) * r, p[1] + (q[1] - p[1]) * r];
    }
    target -= seg;
  }
  return pts[pts.length - 1] as Pt;
}
