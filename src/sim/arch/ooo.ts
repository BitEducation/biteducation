/**
 * Dynamic scheduling with one instruction starting per cycle and unlimited functional units.
 * "inorder" starts instructions in program order, stalling on any operand not ready; "scoreboard"
 * starts the oldest instruction whose operands are ready and that creates no WAR or WAW conflict on
 * the architectural registers; "rename" maps every destination to a fresh physical register, so only
 * true (RAW) dependencies remain. Results retire in program order through a reorder buffer.
 */
export type OooPolicy = "inorder" | "scoreboard" | "rename";
export interface Instr {
  text: string;
  dst: string;
  srcs: string[];
  lat: number;
}
export interface OooRun {
  start: number[];
  done: number[];
  commit: number[];
  end: number;
  /** For the scoreboard: the false dependency that held an instruction back, if any. */
  blocked: (null | { kind: "WAR" | "WAW"; with: number; reg: string })[];
}

/** Index of the latest instruction before i that writes reg, or -1. */
const producer = (prog: Instr[], i: number, reg: string) => {
  for (let j = i - 1; j >= 0; j--) if (prog[j]?.dst === reg) return j;
  return -1;
};

export function rawReady(prog: Instr[], i: number, done: number[]) {
  return Math.max(
    0,
    ...(prog[i]?.srcs ?? []).map((r) => {
      const p = producer(prog, i, r);
      return p < 0 ? 0 : (done[p] ?? Number.POSITIVE_INFINITY);
    }),
  );
}

export function schedule(prog: Instr[], policy: OooPolicy): OooRun {
  const n = prog.length;
  const start: number[] = new Array(n).fill(Number.POSITIVE_INFINITY);
  const done: number[] = new Array(n).fill(Number.POSITIVE_INFINITY);
  const blocked: OooRun["blocked"] = new Array(n).fill(null);
  if (policy === "inorder") {
    let prev = -1;
    for (let i = 0; i < n; i++) {
      const raw = rawReady(prog, i, done);
      const at = Math.max(prev + 1, raw);
      start[i] = at;
      done[i] = at + (prog[i]?.lat ?? 1);
      prev = at;
    }
  } else {
    for (let c = 0, left = n; left > 0 && c < 1000; c++) {
      for (let i = 0; i < n; i++) {
        if (start[i] !== Number.POSITIVE_INFINITY) continue;
        if (rawReady(prog, i, done) > c) continue;
        const me = prog[i] as Instr;
        if (policy === "scoreboard") {
          const war = [...Array(i).keys()].find(
            (j) => prog[j]?.srcs.includes(me.dst) && (start[j] ?? 0) >= c,
          );
          const waw = [...Array(i).keys()].find((j) => prog[j]?.dst === me.dst && (done[j] ?? 0) > c);
          if (war !== undefined || waw !== undefined) {
            blocked[i] ??=
              war !== undefined
                ? { kind: "WAR", with: war, reg: me.dst }
                : { kind: "WAW", with: waw as number, reg: me.dst };
            continue;
          }
        }
        start[i] = c;
        done[i] = c + me.lat;
        left--;
        break;
      }
    }
  }
  const commit: number[] = [];
  done.forEach((d, i) => {
    commit.push(Math.max(d, commit[i - 1] ?? 0));
  });
  return { start, done, commit, end: Math.max(...commit), blocked };
}

/** The program with every destination renamed to a fresh physical register P1, P2, ... */
export function renamed(prog: Instr[]) {
  const map = new Map<string, string>();
  return prog.map((ins, i) => {
    const srcs = ins.srcs.map((r) => map.get(r) ?? r);
    const dst = `P${i + 1}`;
    map.set(ins.dst, dst);
    return { dst, srcs };
  });
}
