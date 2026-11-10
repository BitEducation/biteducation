import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { producerConsumer, runConc, type Thread } from "./conc.ts";

const sems = (cap: number) => ({ vazias: cap, cheias: 0, mutex: 1 });

describe("producer-consumer with semaphores", () => {
  it("delivers every item in order (round robin, quantum 1)", () => {
    const r = runConc(producerConsumer(5), { sems: sems(2), capacity: 2, policy: "rr" });
    expect(r.deadlock).toBe(false);
    expect(r.consumed).toEqual(["i1", "i2", "i3", "i4", "i5"]);
  });
  it("consumer blocks on an empty buffer and is woken by V(cheias)", () => {
    const threads = producerConsumer(1).reverse(); // consumer runs first
    const r = runConc(threads, { sems: sems(1), capacity: 1, policy: "rr", quantum: 10 });
    expect(r.steps[0]).toMatchObject({ tid: "Consumidor", outcome: "block" });
    expect(r.steps.find((s) => s.outcome === "wake")).toMatchObject({ tid: "Produtor", woke: "Consumidor" });
  });
  it("inverted P order in the producer deadlocks when the buffer is full", () => {
    const r = runConc(producerConsumer(4, { invertProducer: true }), {
      sems: sems(1),
      capacity: 1,
      policy: "rr",
      quantum: 20,
    });
    expect(r.deadlock).toBe(true);
    expect(r.blocked.map((b) => b.sem).sort()).toEqual(["mutex", "vazias"]);
  });
  it("a faster producer fills the buffer and blocks on vazias", () => {
    const [prod, cons] = producerConsumer(8) as [Thread, Thread];
    const r = runConc(
      [
        { ...cons, weight: 6 },
        { ...prod, weight: 12 },
      ],
      { sems: sems(4), capacity: 4, policy: "rr" },
    );
    expect(
      r.steps.some(
        (s) => s.tid === "Produtor" && s.outcome === "block" && s.op.op === "P" && s.op.sem === "vazias",
      ),
    ).toBe(true);
    expect(r.maxFill).toBe(4);
    expect(r.consumed).toHaveLength(8);
  });
  it("script policy runs the chosen thread, skipping blocked ones", () => {
    const r = runConc(producerConsumer(1), {
      sems: sems(1),
      capacity: 1,
      policy: "script",
      script: ["Consumidor", "Consumidor", "Produtor"],
    });
    expect(r.steps.slice(0, 3).map((s) => `${s.tid}:${s.outcome}`)).toEqual([
      "Consumidor:block",
      "Produtor:ok",
      "Produtor:ok",
    ]);
  });
  it("property: correct order never deadlocks, never overflows, keeps FIFO order", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 1e6 }),
        (items, cap, seed) => {
          const r = runConc(producerConsumer(items), {
            sems: sems(cap),
            capacity: cap,
            policy: "seeded",
            seed,
          });
          expect(r.deadlock).toBe(false);
          expect(r.consumed).toEqual(Array.from({ length: items }, (_, i) => `i${i + 1}`));
          expect(r.maxFill).toBeLessThanOrEqual(cap);
          for (const s of r.steps) {
            expect(s.sems.mutex).toBeGreaterThanOrEqual(0);
            expect((s.sems.mutex ?? 0) <= 1).toBe(true);
          }
        },
      ),
    );
  });
});
