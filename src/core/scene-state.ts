import type { CellMark, Role, RowMark, SceneSpec, TraceEvent } from "../contracts/types.ts";

export interface NodeState {
  visible: boolean;
  text?: string;
  tone?: "none" | "bad" | "good" | "warn" | "active";
}

export interface SceneState {
  nodes: Record<string, NodeState>;
  queues: Record<string, { item: string; role: Role }[]>;
  grids: Record<string, Record<number, { value: string; mark?: CellMark; role: Role }>>;
  tables: Record<string, Record<number, { cells: string[]; mark?: RowMark }>>;
  gantt: { lane: string; from: number; to: number; item: string; role: Role; gantt?: string }[];
  stages: Record<string, Record<number, { stages: (string | null)[]; marks: (CellMark | undefined)[] }>>;
  counters: Record<string, string>;
  plots: Record<string, Record<string, { role: Role; points: [number, number][] }>>;
  notes: { at: string; text: string; tone: "info" | "warn" | "bad" | "good"; index: number }[];
}

export function initialState(spec: SceneSpec): SceneState {
  const nodes: Record<string, NodeState> = {};
  for (const n of spec.nodes) nodes[n.id] = { visible: !n.hidden };
  return {
    nodes,
    queues: {},
    grids: {},
    tables: {},
    gantt: [],
    stages: {},
    counters: {},
    plots: {},
    notes: [],
  };
}

/**
 * Applies one event. Pure with respect to its inputs: returns a new state object
 * (nested records are copied only where they change).
 * `transient` = the event belongs to the current step, so marks and notes stay visible.
 */
export function applyEvent(s: SceneState, ev: TraceEvent, index: number, transient: boolean): SceneState {
  switch (ev.kind) {
    case "move":
      return s;
    case "state": {
      const prev = s.nodes[ev.target] ?? { visible: true };
      const next: NodeState = { ...prev, visible: true };
      if (ev.text !== undefined) next.text = ev.text;
      if (ev.tone !== undefined) next.tone = ev.tone;
      return { ...s, nodes: { ...s.nodes, [ev.target]: next } };
    }
    case "show":
    case "hide": {
      const nodes = { ...s.nodes };
      for (const id of ev.targets)
        nodes[id] = { ...(nodes[id] ?? { visible: true }), visible: ev.kind === "show" };
      return { ...s, nodes };
    }
    case "enqueue": {
      const q = [...(s.queues[ev.queue] ?? []), { item: ev.item, role: ev.itemRole ?? ev.role }];
      return { ...s, queues: { ...s.queues, [ev.queue]: q } };
    }
    case "dequeue": {
      const q = [...(s.queues[ev.queue] ?? [])];
      const i = q.findIndex((x) => x.item === ev.item);
      if (i >= 0) q.splice(i, 1);
      return { ...s, queues: { ...s.queues, [ev.queue]: q } };
    }
    case "cell": {
      const grid = { ...(s.grids[ev.grid] ?? {}) };
      grid[ev.index] =
        transient && ev.mark
          ? { value: ev.value, mark: ev.mark, role: ev.role }
          : { value: ev.value, role: ev.role };
      return { ...s, grids: { ...s.grids, [ev.grid]: grid } };
    }
    case "row": {
      const table = { ...(s.tables[ev.table] ?? {}) };
      table[ev.index] = transient && ev.mark ? { cells: ev.cells, mark: ev.mark } : { cells: ev.cells };
      return { ...s, tables: { ...s.tables, [ev.table]: table } };
    }
    case "gantt":
      return {
        ...s,
        gantt: [
          ...s.gantt,
          {
            lane: ev.lane,
            from: ev.from,
            to: ev.to,
            item: ev.item,
            role: ev.itemRole,
            ...(ev.gantt ? { gantt: ev.gantt } : {}),
          },
        ],
      };
    case "stage": {
      const pipe = { ...(s.stages[ev.pipeline] ?? {}) };
      pipe[ev.cycle] = { stages: ev.stages, marks: ev.marks ?? [] };
      return { ...s, stages: { ...s.stages, [ev.pipeline]: pipe } };
    }
    case "count":
      return { ...s, counters: { ...s.counters, [ev.counter]: ev.value } };
    case "plot": {
      const chart = { ...(s.plots[ev.chart] ?? {}) };
      const series = chart[ev.series];
      chart[ev.series] = {
        role: ev.seriesRole ?? series?.role ?? ev.role,
        points: [...(series?.points ?? []), [ev.x, ev.y]],
      };
      return { ...s, plots: { ...s.plots, [ev.chart]: chart } };
    }
    case "note":
      if (!transient) return s;
      return { ...s, notes: [...s.notes, { at: ev.at, text: ev.text, tone: ev.tone ?? "info", index }] };
  }
}

/** State after events [0, upto). Events at index >= stepStart are "transient" (current step). */
export function reduceScene(
  spec: SceneSpec,
  trace: readonly TraceEvent[],
  upto: number,
  stepStart: number,
): SceneState {
  let s = initialState(spec);
  const end = Math.min(upto, trace.length);
  for (let i = 0; i < end; i++) {
    const ev = trace[i];
    if (ev) s = applyEvent(s, ev, i, i >= stepStart);
  }
  return s;
}

/** Indices [start, end) of the group of events sharing the same logical time as trace[start]. */
export function groupEnd(trace: readonly TraceEvent[], start: number, limit: number): number {
  const t = trace[start]?.t;
  let end = start + 1;
  while (end < limit && trace[end]?.t === t) end++;
  return end;
}
