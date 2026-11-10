import type {
  Frame,
  NodeKind,
  Role,
  SceneLink,
  SceneNode,
  SceneSpec,
  TraceEvent,
  Widget,
} from "../../contracts/types.ts";
import type { LessonBuilder } from "./builder.ts";

/**
 * Message-sequence helpers shared by protocol lessons: actors laid out on a line, messages as
 * tokens moving between them, and an event-table row for each message. Keeps every lesson's
 * build() down to the protocol itself.
 */
export interface Actor {
  id: string;
  kind: NodeKind;
  label: string;
  sub?: string;
  /** Overrides the automatic position. */
  at?: readonly [number, number];
  w?: number;
  hidden?: boolean;
}

export interface SeqSceneOpts {
  width?: number;
  height?: number;
  /** y of the actor line. */
  y?: number;
  /** "chain" links neighbours, "none" draws no links, or explicit links. */
  links?: "chain" | "none" | SceneLink[];
  zones?: SceneSpec["zones"];
  widgets?: Widget[];
  extra?: SceneNode[];
}

export function seqScene(actors: Actor[], o: SeqSceneOpts = {}): SceneSpec {
  const width = o.width ?? 960;
  const y = o.y ?? 110;
  const gap = width / actors.length;
  const nodes: SceneNode[] = actors.map((a, i) => ({
    id: a.id,
    kind: a.kind,
    label: a.label,
    ...(a.sub ? { sub: a.sub } : {}),
    at: a.at ?? [Math.round(gap / 2 + i * gap), y],
    ...(a.w ? { w: a.w } : {}),
    ...(a.hidden ? { hidden: true } : {}),
  }));
  const links: SceneLink[] =
    o.links === "none"
      ? []
      : Array.isArray(o.links)
        ? o.links
        : actors.slice(1).map((a, i) => ({
            id: `ln-${i}`,
            from: (actors[i] as Actor).id,
            to: a.id,
            style: "bus" as const,
          }));
  return {
    viewBox: [width, o.height ?? 460],
    ...(o.zones ? { zones: o.zones } : {}),
    nodes: [...nodes, ...(o.extra ?? [])],
    links,
    ...(o.widgets ? { widgets: o.widgets } : {}),
  };
}

type Tone = "info" | "warn" | "bad" | "good";

/** A line for the event log attached to a widget event. */
export interface Log {
  who?: string;
  what: string;
  detail?: string;
}

export interface SendOpts {
  /** Inspector frame for this message. */
  frame?: Frame;
  detail?: string;
  role?: Role;
  via?: string[];
  lost?: boolean;
  /** Time advance before this event (default 1). 0 animates together with the previous one. */
  dt?: number;
  /** Event-table "what" column, when it differs from the token label. */
  what?: string;
}

/**
 * Wraps a lesson builder with time and naming. `fmt` turns the logical time into the table's
 * first column; `names` maps node ids to the "who" column.
 */
/** Milliseconds as the table shows them: "88 ms", or "60,03 s" past ten seconds. */
export const fmtMs = (t: number) =>
  t < 10000
    ? `${t} ms`
    : `${(t / 1000)
        .toFixed(2)
        .replace(/\.?0+$/, "")
        .replace(".", ",")} s`;

export function talk(b: LessonBuilder, names: Record<string, string>, fmt: (t: number) => string = fmtMs) {
  let t = 0;
  const who = (id: string) => names[id] ?? id;
  const logRow = (at: number, l?: Log) =>
    l ? { row: { cols: { t: fmt(at), who: l.who ?? "", what: l.what, detail: l.detail ?? "" } } } : {};
  const adv = (dt = 1) => {
    t += dt;
    return t;
  };
  return {
    get t() {
      return t;
    },
    /** Jumps the clock to an absolute time. */
    at(v: number) {
      t = v;
    },
    send(from: string, to: string, label: string, o: SendOpts = {}): number {
      const at = adv(o.dt);
      const fid = o.frame ? b.frame(o.frame) : undefined;
      return b.ev({
        t: at,
        kind: "move",
        from,
        to,
        role: o.role ?? "a",
        label,
        ...(o.via ? { via: o.via } : {}),
        ...(o.lost ? { lost: true } : {}),
        ...(fid ? { frame: fid } : {}),
        row: {
          cols: {
            t: fmt(at),
            who: `${who(from)} → ${who(to)}`,
            what: o.what ?? label,
            detail: o.detail ?? (o.lost ? "perdido" : ""),
          },
        },
      });
    },
    state(
      target: string,
      text: string,
      o: {
        tone?: "none" | "bad" | "good" | "warn" | "active";
        role?: Role;
        label?: string;
        detail?: string;
        dt?: number;
        frame?: Frame;
      } = {},
    ): number {
      const at = adv(o.dt);
      const fid = o.frame ? b.frame(o.frame) : undefined;
      return b.ev({
        t: at,
        kind: "state",
        target,
        text,
        tone: o.tone ?? "active",
        role: o.role ?? "a",
        label: o.label ?? text,
        ...(fid ? { frame: fid } : {}),
        row: { cols: { t: fmt(at), who: who(target), what: o.label ?? text, detail: o.detail ?? "" } },
      });
    },
    note(
      at: string,
      text: string,
      tone: Tone = "info",
      o: { dt?: number; role?: Role; label?: string } = {},
    ): number {
      return b.ev({
        t: adv(o.dt ?? 0),
        kind: "note",
        at,
        text,
        tone,
        role: o.role ?? "muted",
        label: o.label ?? text,
      });
    },
    row(
      table: string,
      index: number,
      cells: string[],
      o: {
        mark?: "hit" | "miss" | "new" | "bad" | "warn";
        label?: string;
        role?: Role;
        dt?: number;
        log?: Log;
      } = {},
    ): number {
      const at = adv(o.dt ?? 0);
      return b.ev({
        t: at,
        kind: "row",
        table,
        index,
        cells,
        ...(o.mark ? { mark: o.mark } : {}),
        role: o.role ?? "b",
        label: o.label ?? cells.join(" "),
        ...logRow(at, o.log),
      });
    },
    cell(
      grid: string,
      index: number,
      value: string,
      o: {
        mark?: "hit" | "miss" | "evict" | "dirty" | "new" | "bubble" | "flush";
        label?: string;
        role?: Role;
        dt?: number;
        /** Also writes a line in the event log. */
        log?: Log;
      } = {},
    ): number {
      const at = adv(o.dt ?? 0);
      return b.ev({
        t: at,
        kind: "cell",
        grid,
        index,
        value,
        ...(o.mark ? { mark: o.mark } : {}),
        role: o.role ?? "b",
        label: o.label ?? value,
        ...logRow(at, o.log),
      });
    },
    count(counter: string, value: string, o: { label?: string; dt?: number; role?: Role } = {}): number {
      return b.ev({
        t: adv(o.dt ?? 0),
        kind: "count",
        counter,
        value,
        role: o.role ?? "warn",
        label: o.label ?? value,
      });
    },
    plot(
      chart: string,
      series: string,
      x: number,
      y: number,
      o: { role?: Role; label?: string; dt?: number } = {},
    ): number {
      return b.ev({
        t: adv(o.dt ?? 0),
        kind: "plot",
        chart,
        series,
        x,
        y,
        role: o.role ?? "a",
        ...(o.role ? { seriesRole: o.role } : {}),
        label: o.label ?? `${series}: ${y}`,
      });
    },
    show(targets: string[], o: { dt?: number; label?: string } = {}): number {
      return b.ev({ t: adv(o.dt ?? 0), kind: "show", targets, role: "muted", label: o.label ?? "mostra" });
    },
    hide(targets: string[], o: { dt?: number; label?: string } = {}): number {
      return b.ev({ t: adv(o.dt ?? 0), kind: "hide", targets, role: "muted", label: o.label ?? "esconde" });
    },
    /** Escape hatch for events the helpers do not cover; t is filled in. */
    raw(e: Omit<TraceEvent, "t"> & { dt?: number }): number {
      const { dt, ...rest } = e as { dt?: number } & Record<string, unknown>;
      return b.ev({ ...(rest as unknown as TraceEvent), t: adv(dt ?? 0) });
    },
  };
}

export type Talk = ReturnType<typeof talk>;
