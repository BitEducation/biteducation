import { describe, expect, it } from "vitest";
import lesson, { parseAddrs } from "./cache-direta.ts";

const tiles = (run: ReturnType<typeof lesson.build>) => {
  let at = 0;
  for (const s of run.steps) {
    expect(s.events[0]).toBe(at);
    expect(s.events[1]).toBeGreaterThan(s.events[0]);
    at = s.events[1];
  }
  expect(at).toBe(run.trace.length);
};

describe("lesson cache-direta", () => {
  const run = lesson.build(lesson.params.defaults);
  it("matches the hand-worked sequence", () => {
    expect(run.stats).toMatchObject({
      hits: 5,
      misses: 7,
      compulsory: 4,
      conflict: 3,
      capacity: 0,
      twoWayHits: 8,
    });
    expect(Number(run.stats.amat)).toBeCloseTo(1 + (7 / 12) * 100);
  });
  it("has 7 steps, a pick quiz answering line 0, and counts 7 misses", () => {
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-endereco",
      "s2-primeira",
      "s3-vizinhos",
      "s4-conflito",
      "s5-resto",
      "s6-tempo",
      "s7-vias",
    ]);
    const quiz = run.steps[3]?.quiz;
    expect(quiz?.kind === "pick" && quiz.answer).toBe("linha-0");
    expect(run.trace.filter((e) => lesson.counter?.test(e)).length).toBe(7);
    tiles(run);
  });
  it("is deterministic", () => {
    expect(JSON.stringify(lesson.build(lesson.params.defaults))).toBe(JSON.stringify(run));
  });
  it("lab builds with custom addresses and ways", () => {
    for (const vias of ["1", "2", "4"])
      for (const politica of ["lru", "fifo"]) {
        const r = lesson.build({
          enderecos: "0x0000 0x0080 0x0100 0x0000 0x0080, 16 0xFFFF",
          vias,
          politica,
        });
        expect(r.steps.length).toBeGreaterThanOrEqual(2);
        tiles(r);
      }
    const two = lesson.build({ enderecos: "", vias: "2", politica: "lru" });
    expect(two.stats.hits).toBe(8);
    expect(() => parseAddrs("0x10000")).toThrow();
    expect(() => parseAddrs("abc")).toThrow();
    expect(() => parseAddrs(Array(25).fill("0").join(" "))).toThrow();
  });
});
