import type { Frame, LessonRun, Step, TraceEvent } from "../../contracts/types.ts";

type StepMeta = Omit<Step, "events">;

/**
 * Helper used by every lesson's build(): records events and cuts them into steps.
 * Each step() call owns the half-open slice of the trace written inside its body.
 */
export function lessonBuilder() {
  const trace: TraceEvent[] = [];
  const steps: Step[] = [];
  const frames: Record<string, Frame> = {};
  return {
    ev(e: TraceEvent): number {
      trace.push(e);
      return trace.length - 1;
    },
    step(meta: StepMeta, body: () => void): void {
      const start = trace.length;
      body();
      if (trace.length === start) throw new Error(`Passo sem eventos: ${meta.id}`);
      steps.push({ ...meta, events: [start, trace.length] });
    },
    frame(f: Frame): string {
      frames[f.id] = f;
      return f.id;
    },
    get length() {
      return trace.length;
    },
    done(stats: LessonRun["stats"], labNotes?: string[]): LessonRun {
      return { steps, trace, frames, stats, ...(labNotes?.length ? { labNotes } : {}) };
    },
  };
}

export type LessonBuilder = ReturnType<typeof lessonBuilder>;
