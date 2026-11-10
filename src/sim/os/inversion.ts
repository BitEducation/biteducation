/**
 * Preemptive priority scheduling on one CPU with a single mutex. Three tasks: L (low) takes the
 * mutex first, H (high) needs it later, M (medium) never touches it. Protocols: none, busy waiting
 * instead of blocking, priority inheritance and immediate priority ceiling.
 */
export type Protocol = "none" | "spin" | "inherit" | "ceiling";
export type Name = "H" | "M" | "L";

export interface TaskSpec {
  name: Name;
  prio: number;
  arrive: number;
  pre: number;
  cs: number;
  post: number;
}

export interface Slice {
  t: number;
  task: Name;
  /** What the task did in this tick. */
  kind: "cpu" | "cs" | "spin";
  /** Effective priority while running. */
  prio: number;
}

export interface RunResult {
  slices: Slice[];
  finish: Partial<Record<Name, number>>;
  /** First tick H asked for the mutex and the tick it got it (null if never). */
  hAsked: number | null;
  hGot: number | null;
  done: boolean;
}

export const CEILING = 3;

export function tasks(medium: number, section: number): TaskSpec[] {
  return [
    { name: "L", prio: 1, arrive: 0, pre: 1, cs: section, post: 1 },
    { name: "H", prio: 3, arrive: 2, pre: 1, cs: 2, post: 1 },
    { name: "M", prio: 2, arrive: 3, pre: medium, cs: 0, post: 0 },
  ];
}

export function run(specs: TaskSpec[], protocol: Protocol, limit = 60): RunResult {
  const st = specs.map((s) => ({ ...s, done: 0, eff: s.prio }));
  const total = (s: TaskSpec) => s.pre + s.cs + s.post;
  let holder: Name | null = null;
  const waiting = new Set<Name>();
  const slices: Slice[] = [];
  const finish: Partial<Record<Name, number>> = {};
  let hAsked: number | null = null;
  let hGot: number | null = null;
  let current: Name | null = null;

  for (let t = 0; t < limit; t++) {
    const ready = st.filter((s) => s.arrive <= t && s.done < total(s) && !waiting.has(s.name));
    if (!ready.length) {
      if (st.every((s) => s.done >= total(s))) break;
      continue;
    }
    const best = Math.max(...ready.map((s) => s.eff));
    // An equal priority does not preempt the running task.
    const pick =
      ready.find((s) => s.name === current && s.eff === best) ??
      ready.filter((s) => s.eff === best).sort((a, b) => a.arrive - b.arrive)[0];
    if (!pick) break;
    current = pick.name;
    const inCs = pick.done >= pick.pre && pick.done < pick.pre + pick.cs;
    if (inCs && holder !== pick.name) {
      if (pick.name === "H" && hAsked === null) hAsked = t;
      if (holder === null) {
        holder = pick.name;
        if (pick.name === "H") hGot = t;
        if (protocol === "ceiling") pick.eff = CEILING;
      } else if (protocol === "spin") {
        slices.push({ t, task: pick.name, kind: "spin", prio: pick.eff });
        continue;
      } else {
        waiting.add(pick.name);
        if (protocol === "inherit") {
          const h = st.find((s) => s.name === holder);
          if (h) h.eff = Math.max(h.eff, pick.eff);
        }
        // The tick is not lost: schedule again in the same instant.
        t--;
        continue;
      }
    }
    slices.push({ t, task: pick.name, kind: inCs ? "cs" : "cpu", prio: pick.eff });
    pick.done++;
    if (inCs && pick.done === pick.pre + pick.cs) {
      holder = null;
      pick.eff = pick.prio;
      const next = st.filter((s) => waiting.has(s.name)).sort((a, b) => b.prio - a.prio)[0];
      if (next) {
        waiting.delete(next.name);
        holder = next.name;
        if (next.name === "H") hGot = t + 1;
        if (protocol === "ceiling") next.eff = CEILING;
      }
    }
    if (pick.done >= total(pick)) finish[pick.name] = t + 1;
  }
  return { slices, finish, hAsked, hGot, done: st.every((s) => s.done >= total(s)) };
}
