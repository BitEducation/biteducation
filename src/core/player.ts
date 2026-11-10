import type { LessonRun, SceneSpec, TraceEvent } from "../contracts/types.ts";
import { groupEnd, reduceScene, type SceneState } from "./scene-state.ts";
import type { Store } from "./store.ts";
import { fastMode } from "./test-hooks.ts";

/** Player phases. stepIndex -1 = overview, steps.length = outro. */
export type Phase = "overview" | "playing" | "paused" | "step-end" | "quiz" | "done";

export interface PlayerState {
  phase: Phase;
  stepIndex: number;
  cursor: number;
  speed: number;
  continuous: boolean;
  selected: number | null;
}

export interface PlayerHost {
  renderState(state: SceneState, cursor: number): void;
  animate(ev: TraceEvent, index: number, speed: number): Promise<void>;
  cancelAnimations(): void;
  onStepSeen?(stepIndex: number): void;
  onDone?(): void;
  /** Returns true when the quiz of this step still needs an answer in this session. */
  needsQuiz?(stepIndex: number): boolean;
}

export interface Player {
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  prev(): void;
  goTo(stepIndex: number, autoplay?: boolean): void;
  stepEvent(): void;
  stepEventBack(): void;
  overview(): void;
  restart(): void;
  answeredQuiz(): void;
  setSpeed(speed: number): void;
  setContinuous(v: boolean): void;
  dispose(): void;
}

const GAP_MS = 120;
const STEP_PAUSE_MS = 600;

export function createPlayer(
  spec: SceneSpec,
  run: LessonRun,
  store: Store<PlayerState>,
  host: PlayerHost,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, fastMode() ? 0 : ms)),
): Player {
  let runId = 0;
  const steps = run.steps;
  const last = steps.length - 1;

  const stepStart = (i: number) => steps[i]?.events[0] ?? run.trace.length;
  const stepEnd = (i: number) => steps[i]?.events[1] ?? run.trace.length;

  function renderAt(cursor: number, stepIndex: number) {
    const start = stepIndex >= 0 && stepIndex <= last ? stepStart(stepIndex) : cursor;
    host.renderState(reduceScene(spec, run.trace, cursor, start), cursor);
  }

  function stop() {
    runId++;
    host.cancelAnimations();
  }

  async function loop(id: number, once: boolean) {
    for (;;) {
      const s = store.get();
      const i = s.stepIndex;
      const end = stepEnd(i);
      if (s.cursor < end) {
        const gEnd = groupEnd(run.trace, s.cursor, end);
        const anims: Promise<void>[] = [];
        for (let k = s.cursor; k < gEnd; k++) {
          const ev = run.trace[k];
          if (ev) anims.push(host.animate(ev, k, store.get().speed));
        }
        await Promise.all(anims);
        if (id !== runId) return;
        store.set({ cursor: gEnd });
        renderAt(gEnd, i);
        if (once) {
          store.set({ phase: gEnd >= end ? "step-end" : "paused" });
          if (gEnd >= end) host.onStepSeen?.(i);
          return;
        }
        await sleep(GAP_MS / store.get().speed);
        if (id !== runId) return;
        continue;
      }
      // step finished
      host.onStepSeen?.(i);
      if (i >= last) {
        store.set({ phase: "step-end" });
        await sleep(STEP_PAUSE_MS / store.get().speed);
        if (id !== runId) return;
        finish();
        return;
      }
      if (!store.get().continuous) {
        store.set({ phase: "step-end" });
        return;
      }
      await sleep(STEP_PAUSE_MS / store.get().speed);
      if (id !== runId) return;
      enterStep(i + 1, true);
      return;
    }
  }

  function finish() {
    stop();
    store.set({ phase: "done", stepIndex: steps.length, cursor: run.trace.length });
    renderAt(run.trace.length, steps.length);
    host.onDone?.();
  }

  function enterStep(i: number, autoplay: boolean) {
    stop();
    if (i < 0) return overview();
    if (i > last) return finish();
    const cursor = stepStart(i);
    store.set({ stepIndex: i, cursor, phase: "paused", selected: null });
    renderAt(cursor, i);
    if (host.needsQuiz?.(i)) {
      store.set({ phase: "quiz" });
      return;
    }
    if (autoplay) start(false);
  }

  function start(once: boolean) {
    const id = ++runId;
    store.set({ phase: "playing" });
    void loop(id, once);
  }

  function overview() {
    stop();
    store.set({ phase: "overview", stepIndex: -1, cursor: 0, selected: null });
    renderAt(0, -1);
  }

  const api: Player = {
    play() {
      const s = store.get();
      if (s.phase === "playing") return;
      if (s.phase === "overview") return enterStep(0, true);
      if (s.phase === "done") return enterStep(0, true);
      if (s.phase === "quiz") return;
      if (s.phase === "step-end") {
        if (s.stepIndex >= last) return finish();
        return enterStep(s.stepIndex + 1, true);
      }
      start(false);
    },
    pause() {
      if (store.get().phase !== "playing") return;
      stop();
      const s = store.get();
      renderAt(s.cursor, s.stepIndex);
      store.set({ phase: "paused" });
    },
    toggle() {
      if (store.get().phase === "playing") api.pause();
      else api.play();
    },
    next() {
      const s = store.get();
      const playing = s.phase === "playing";
      if (s.phase === "done") return;
      enterStep(s.stepIndex + 1, playing);
    },
    prev() {
      const s = store.get();
      const playing = s.phase === "playing";
      if (s.phase === "done") return enterStep(last, false);
      enterStep(s.stepIndex - 1, playing);
    },
    goTo(i, autoplay = false) {
      enterStep(Math.max(0, Math.min(last, i)), autoplay);
    },
    stepEvent() {
      const s = store.get();
      if (s.phase === "overview") {
        enterStep(0, false);
        if (store.get().phase !== "quiz") start(true);
        return;
      }
      if (s.phase === "quiz" || s.phase === "done") return;
      if (s.cursor >= stepEnd(s.stepIndex)) {
        if (s.stepIndex >= last) return finish();
        enterStep(s.stepIndex + 1, false);
        if (store.get().phase !== "quiz") start(true);
        return;
      }
      stop();
      start(true);
    },
    stepEventBack() {
      const s = store.get();
      if (s.stepIndex < 0 || s.phase === "done") return;
      stop();
      const begin = stepStart(s.stepIndex);
      if (s.cursor <= begin) return enterStep(s.stepIndex - 1, false);
      // move back one group
      let k = begin;
      let prevGroup = begin;
      while (k < s.cursor) {
        prevGroup = k;
        k = groupEnd(run.trace, k, s.cursor);
      }
      store.set({ cursor: prevGroup, phase: "paused" });
      renderAt(prevGroup, s.stepIndex);
    },
    overview,
    restart() {
      enterStep(0, true);
    },
    answeredQuiz() {
      if (store.get().phase !== "quiz") return;
      start(false);
    },
    setSpeed(speed) {
      store.set({ speed });
    },
    setContinuous(v) {
      store.set({ continuous: v });
    },
    dispose() {
      stop();
    },
  };
  renderAt(0, -1);
  return api;
}
