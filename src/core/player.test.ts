import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { LessonRun, SceneSpec, TraceEvent } from "../contracts/types.ts";
import { createPlayer, type PlayerState } from "./player.ts";
import { applyEvent, initialState, reduceScene } from "./scene-state.ts";
import { createStore } from "./store.ts";

const spec: SceneSpec = {
  viewBox: [100, 100],
  nodes: [
    { id: "a", kind: "box", label: "A", at: [10, 10] },
    { id: "b", kind: "box", label: "B", at: [50, 10], hidden: true },
  ],
};

function makeRun(groups: number[]): LessonRun {
  const trace: TraceEvent[] = [];
  groups.forEach((size, t) => {
    for (let k = 0; k < size; k++)
      trace.push({ kind: "enqueue", queue: "q", item: `i${t}-${k}`, t, role: "a", label: "x" });
  });
  const half = Math.floor(trace.length / 2);
  return {
    steps: [
      { id: "s1-a", title: "a", subtitle: "", text: "", facts: [], events: [0, half] },
      { id: "s2-b", title: "b", subtitle: "", text: "", facts: [], events: [half, trace.length] },
    ],
    trace,
    frames: {},
    stats: {},
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle() {
  for (let i = 0; i < 200; i++) await tick();
}

function setup(run: LessonRun, quizAt?: number) {
  const store = createStore<PlayerState>({
    phase: "overview",
    stepIndex: -1,
    cursor: 0,
    speed: 1,
    continuous: true,
    selected: null,
  });
  const seen: number[] = [];
  let done = 0;
  let lastCursor = -1;
  const player = createPlayer(
    spec,
    run,
    store,
    {
      renderState: (_s, c) => {
        lastCursor = c;
      },
      animate: () => Promise.resolve(),
      cancelAnimations: () => {},
      onStepSeen: (i) => seen.push(i),
      onDone: () => done++,
      needsQuiz: (i) => i === quizAt,
    },
    () => Promise.resolve(),
  );
  return {
    store,
    player,
    seen,
    get done() {
      return done;
    },
    get cursor() {
      return lastCursor;
    },
  };
}

describe("player", () => {
  it("plays every step to the outro in continuous mode", async () => {
    const run = makeRun([1, 2, 1, 3]);
    const t = setup(run);
    t.player.play();
    await settle();
    expect(t.store.get().phase).toBe("done");
    expect(t.store.get().cursor).toBe(run.trace.length);
    expect(t.seen).toEqual([0, 1]);
    expect(t.done).toBe(1);
  });

  it("stops at a quiz and resumes after the answer", async () => {
    const t = setup(makeRun([1, 1, 1, 1]), 1);
    t.player.play();
    await settle();
    expect(t.store.get().phase).toBe("quiz");
    expect(t.store.get().stepIndex).toBe(1);
    t.player.answeredQuiz();
    await settle();
    expect(t.store.get().phase).toBe("done");
  });

  it("goTo seeks instantly to the start of the step", () => {
    const run = makeRun([2, 2, 2]);
    const t = setup(run);
    t.player.goTo(1);
    expect(t.store.get().cursor).toBe(run.steps[1]?.events[0]);
    expect(t.cursor).toBe(run.steps[1]?.events[0]);
  });

  it("stepEvent advances one time group at a time, stepEventBack undoes it", async () => {
    const run = makeRun([2, 1, 3, 1]);
    const t = setup(run);
    t.player.stepEvent();
    await settle();
    expect(t.store.get().cursor).toBe(2);
    t.player.stepEvent();
    await settle();
    expect(t.store.get().cursor).toBe(3);
    t.player.stepEventBack();
    expect(t.store.get().cursor).toBe(2);
  });

  it("step mode (not continuous) stops at the end of each step", async () => {
    const t = setup(makeRun([1, 1, 1, 1]));
    t.player.setContinuous(false);
    t.player.play();
    await settle();
    expect(t.store.get().phase).toBe("step-end");
    expect(t.store.get().stepIndex).toBe(0);
  });
});

describe("reduceScene", () => {
  it("seeking directly equals applying events one by one (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 4 }), { minLength: 1, maxLength: 12 }),
        fc.nat(),
        (groups, k) => {
          const run = makeRun(groups);
          const upto = k % (run.trace.length + 1);
          let s = initialState(spec);
          run.trace.slice(0, upto).forEach((ev, i) => {
            s = applyEvent(s, ev, i, true);
          });
          expect(reduceScene(spec, run.trace, upto, 0)).toEqual(s);
        },
      ),
    );
  });
  it("show/hide and transient marks", () => {
    const trace: TraceEvent[] = [
      { kind: "show", targets: ["b"], t: 0, role: "a", label: "" },
      { kind: "cell", grid: "g", index: 1, value: "x", mark: "hit", t: 1, role: "a", label: "" },
      { kind: "note", at: "a", text: "oi", t: 2, role: "a", label: "" },
    ];
    expect(reduceScene(spec, trace, 3, 0).nodes.b?.visible).toBe(true);
    expect(reduceScene(spec, trace, 3, 3).grids.g?.[1]).toEqual({ value: "x", role: "a" });
    expect(reduceScene(spec, trace, 3, 3).notes).toEqual([]);
    expect(reduceScene(spec, trace, 3, 1).notes).toHaveLength(1);
  });
});
