import type { SceneSpec, Step, TraceEvent } from "../contracts/types.ts";

/**
 * What a step should draw the eye to: the author's highlight when there is one, otherwise every
 * node and widget the step's events change. Signalling where to look lowers the load of a busy scene.
 */
export function focusOf(step: Step | undefined, trace: readonly TraceEvent[], spec: SceneSpec): string[] {
  if (!step) return [];
  if (step.highlight?.length) return step.highlight;
  const ids = new Set<string>();
  const ganttOf = (lane: string) =>
    spec.widgets?.find((w) => w.kind === "gantt" && w.lanes.includes(lane))?.id;
  for (const ev of trace.slice(step.events[0], step.events[1])) {
    switch (ev.kind) {
      case "move":
        ids.add(ev.from).add(ev.to);
        break;
      case "state":
        ids.add(ev.target);
        break;
      case "row":
        ids.add(ev.table);
        break;
      case "cell":
        ids.add(ev.grid);
        break;
      case "count":
        ids.add(ev.counter);
        break;
      case "plot":
        ids.add(ev.chart);
        break;
      case "stage":
        ids.add(ev.pipeline);
        break;
      case "enqueue":
      case "dequeue":
        ids.add(ev.queue);
        break;
      case "gantt": {
        const g = ev.gantt ?? ganttOf(ev.lane);
        if (g) ids.add(g);
        break;
      }
      default:
        break;
    }
  }
  return [...ids];
}
