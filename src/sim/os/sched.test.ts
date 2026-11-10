import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Algo, type Proc, schedule } from "./sched.ts";

const p = (pid: string, arrival: number, burst: number, priority = 0): Proc => ({
  pid,
  arrival,
  burst,
  priority,
});
const waits = (r: ReturnType<typeof schedule>) =>
  Object.fromEntries(Object.entries(r.stats).map(([k, s]) => [k, s.wait]));

// Golden examples worked by hand (Silberschatz, ch. 5).
describe("schedule: golden examples", () => {
  const three = [p("P1", 0, 24), p("P2", 0, 3), p("P3", 0, 3)];
  it("FCFS", () => {
    const r = schedule(three, { algo: "fcfs" });
    expect(waits(r)).toEqual({ P1: 0, P2: 24, P3: 27 });
    expect(r.avgWait).toBe(17);
  });
  it("SJF", () => {
    expect(waits(schedule(three, { algo: "sjf" }))).toEqual({ P1: 6, P2: 0, P3: 3 });
  });
  it("RR q=4", () => {
    const r = schedule(three, { algo: "rr", quantum: 4 });
    expect(waits(r)).toEqual({ P1: 6, P2: 4, P3: 7 });
    expect(r.slices.map((s) => `${s.pid}:${s.from}-${s.to}`)).toEqual([
      "P1:0-4",
      "P2:4-7",
      "P3:7-10",
      "P1:10-30",
    ]);
  });
  it("SRTF", () => {
    const r = schedule([p("P1", 0, 8), p("P2", 1, 4), p("P3", 2, 9), p("P4", 3, 5)], { algo: "srtf" });
    expect(r.avgWait).toBe(6.5);
  });
  it("priority", () => {
    const r = schedule(
      [p("P1", 0, 10, 3), p("P2", 0, 1, 1), p("P3", 0, 2, 4), p("P4", 0, 1, 5), p("P5", 0, 5, 2)],
      { algo: "prio" },
    );
    expect(r.avgWait).toBeCloseTo(8.2);
  });
  it("RR: arrival enters the queue before the preempted process", () => {
    const r = schedule([p("A", 0, 4), p("B", 2, 2)], { algo: "rr", quantum: 2 });
    expect(r.slices.map((s) => s.pid)).toEqual(["A", "B", "A"]);
  });
  it("context switch cost occupies the CPU", () => {
    const r = schedule([p("A", 0, 2), p("B", 0, 2)], { algo: "rr", quantum: 1, switchCost: 1 });
    expect(r.slices.map((s) => `${s.kind}:${s.from}-${s.to}`)).toEqual([
      "run:0-1",
      "switch:1-2",
      "run:2-3",
      "switch:3-4",
      "run:4-5",
      "switch:5-6",
      "run:6-7",
    ]);
    expect(r.utilization).toBeCloseTo(4 / 7);
  });
  it("idle gap before a late arrival", () => {
    const r = schedule([p("A", 3, 2)], { algo: "fcfs" });
    expect(r.slices[0]).toEqual({ pid: null, kind: "idle", from: 0, to: 3 });
    expect(r.stats.A).toEqual({ finish: 5, turnaround: 2, wait: 0, response: 0 });
  });
  it("rejects invalid input", () => {
    expect(() => schedule([], { algo: "fcfs" })).toThrow();
    expect(() => schedule([p("A", 0, 0)], { algo: "fcfs" })).toThrow();
    expect(() => schedule([p("A", 0, 1), p("A", 0, 1)], { algo: "fcfs" })).toThrow();
  });
});

const procsArb = fc
  .array(
    fc.record({
      arrival: fc.integer({ min: 0, max: 12 }),
      burst: fc.integer({ min: 1, max: 8 }),
      priority: fc.integer({ min: 0, max: 5 }),
    }),
    {
      minLength: 1,
      maxLength: 6,
    },
  )
  .map((xs) => xs.map((x, i) => ({ pid: `P${i + 1}`, ...x })));

describe("schedule: properties", () => {
  const algos: Algo[] = ["fcfs", "sjf", "srtf", "rr", "prio"];
  it("each process runs exactly its burst, slices tile the timeline", () => {
    fc.assert(
      fc.property(
        procsArb,
        fc.constantFrom(...algos),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 0, max: 2 }),
        (procs, algo, quantum, switchCost) => {
          const r = schedule(procs, { algo, quantum, switchCost });
          let t = 0;
          for (const s of r.slices) {
            expect(s.from).toBe(t);
            expect(s.to).toBeGreaterThan(s.from);
            t = s.to;
          }
          expect(t).toBe(r.makespan);
          for (const pr of procs) {
            const ran = r.slices
              .filter((s) => s.pid === pr.pid && s.kind === "run")
              .reduce((a, s) => a + s.to - s.from, 0);
            expect(ran).toBe(pr.burst);
            const st = r.stats[pr.pid];
            expect(st?.wait).toBeGreaterThanOrEqual(0);
            expect(st?.response).toBeLessThanOrEqual(st?.wait ?? 0);
            // never runs before arriving
            for (const s of r.slices.filter((x) => x.pid === pr.pid))
              expect(s.from).toBeGreaterThanOrEqual(pr.arrival);
          }
        },
      ),
    );
  });
  it("RR with a huge quantum equals FCFS", () => {
    fc.assert(
      fc.property(procsArb, (procs) => {
        expect(waits(schedule(procs, { algo: "rr", quantum: 1000 }))).toEqual(
          waits(schedule(procs, { algo: "fcfs" })),
        );
      }),
    );
  });
  it("SRTF minimizes average wait among the algorithms (no switch cost)", () => {
    fc.assert(
      fc.property(procsArb, (procs) => {
        const srtf = schedule(procs, { algo: "srtf" }).avgWait;
        for (const algo of ["fcfs", "sjf", "rr"] as Algo[])
          expect(srtf).toBeLessThanOrEqual(schedule(procs, { algo }).avgWait + 1e-9);
      }),
    );
  });
});
