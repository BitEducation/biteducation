import type { NodeKind, SceneLink, SceneNode, SceneSpec } from "../contracts/types.ts";
import { isDevice } from "./pictograms.ts";

export type Pt = readonly [number, number];

const SIZES: Partial<Record<NodeKind, readonly [number, number]>> = {
  layer: [190, 34],
  process: [118, 56],
  box: [124, 48],
  cpu: [124, 56],
  memory: [130, 56],
};

/** Approximate glyph widths of .node .label (14.5px bold) and .node .sub (12px mono). */
const LABEL_EM = 8.3;
const SUB_EM = 7.3;

/**
 * Width grows to fit the text, so a long address never spills out of its box. `pict` is the
 * room taken by the pictogram on the left (render.ts draws it for most kinds).
 */
export function nodeSize(n: SceneNode, pict = false): readonly [number, number] {
  const base = SIZES[n.kind] ?? [128, 54];
  const text = Math.max(n.label.length * LABEL_EM, (n.sub ?? "").length * SUB_EM);
  const need = Math.ceil(text + (pict ? (isDevice(n.kind) ? 70 : 60) : 24));
  return [Math.max(n.w ?? base[0], need), n.h ?? base[1]];
}

export function linkPoints(spec: SceneSpec, link: SceneLink): Pt[] | null {
  const a = spec.nodes.find((n) => n.id === link.from);
  const b = spec.nodes.find((n) => n.id === link.to);
  if (!a || !b) return null;
  if (link.via && link.via.length > 0) return [a.at, ...link.via, b.at];
  return elbow(a.at, b.at);
}

export function elbow(a: Pt, b: Pt): Pt[] {
  if (a[0] === b[0] || a[1] === b[1]) return [a, b];
  return [a, [b[0], a[1]], b];
}

/** Path between two nodes: along a declared link when one exists, else an elbow. */
function pathBetween(spec: SceneSpec, from: string, to: string): Pt[] | null {
  const link = spec.links?.find((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
  if (link) {
    const pts = linkPoints(spec, link);
    if (!pts) return null;
    return link.from === from ? pts : [...pts].reverse();
  }
  const a = spec.nodes.find((n) => n.id === from);
  const b = spec.nodes.find((n) => n.id === to);
  if (!a || !b) return null;
  return elbow(a.at, b.at);
}

export function routeThrough(spec: SceneSpec, ids: string[]): Pt[] | null {
  const out: Pt[] = [];
  for (let i = 0; i < ids.length - 1; i++) {
    const seg = pathBetween(spec, ids[i] as string, ids[i + 1] as string);
    if (!seg) return null;
    out.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return out;
}

export function polylineLength(pts: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1] as Pt;
    const q = pts[i] as Pt;
    len += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return len;
}

/** Keyframe offsets (0..1) for each vertex, proportional to distance travelled. */
export function vertexOffsets(pts: readonly Pt[]): number[] {
  const total = polylineLength(pts) || 1;
  const out = [0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1] as Pt;
    const q = pts[i] as Pt;
    acc += Math.hypot(q[0] - p[0], q[1] - p[1]);
    out.push(acc / total);
  }
  return out;
}

/** SVG path with rounded corners (radius r) through the points. */
export function roundedPath(pts: readonly Pt[], r = 8): string {
  if (pts.length < 2) return "";
  const f = (n: number) => Number(n.toFixed(1));
  const first = pts[0] as Pt;
  let d = `M${f(first[0])},${f(first[1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i - 1] as Pt;
    const c = pts[i] as Pt;
    const n = pts[i + 1] as Pt;
    const d1 = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const d2 = Math.hypot(n[0] - c[0], n[1] - c[1]);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const a: Pt = [c[0] + ((p[0] - c[0]) / d1) * rr, c[1] + ((p[1] - c[1]) / d1) * rr];
    const b: Pt = [c[0] + ((n[0] - c[0]) / d2) * rr, c[1] + ((n[1] - c[1]) / d2) * rr];
    d += ` L${f(a[0])},${f(a[1])} Q${f(c[0])},${f(c[1])} ${f(b[0])},${f(b[1])}`;
  }
  const last = pts[pts.length - 1] as Pt;
  return `${d} L${f(last[0])},${f(last[1])}`;
}

/** Rough text width for 11px Plex Mono / 12px sans, enough for pill sizing. */
export function textWidth(s: string, px = 11, mono = true): number {
  return s.length * px * (mono ? 0.6 : 0.56);
}

export function moveDuration(lengthPx: number, speed: number): number {
  return Math.min(1300, 450 + lengthPx * 1.1) / speed;
}
