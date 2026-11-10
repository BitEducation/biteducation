import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./tcp-conexao.ts";

describe("lesson tcp-conexao", () => {
  const run = lesson.build(lesson.params.defaults);
  it("tour: one loss, one fast retransmit, no timeout", () => {
    expect(run.stats).toMatchObject({ lost: 1, fast: 1, timeouts: 0, retransmits: 1 });
    expect(run.steps.map((s) => s.id)).toEqual([
      "s1-handshake",
      "s2-envio",
      "s3-perda",
      "s4-duplicados",
      "s5-retransmissao",
      "s6-fim",
    ]);
    const q = run.steps[3]?.quiz;
    expect(q?.kind === "choice" && q.answer).toBe(1);
    expect(run.trace.filter((e) => lesson.counter?.test(e)).length).toBe(1);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
  });
  it("the duplicate-ACK step ends on the third duplicate", () => {
    const s = run.steps[3];
    const dups = run.trace
      .slice(s?.events[0], s?.events[1])
      .filter((e) => e.kind === "state" && e.target === "lia" && e.tone === "warn");
    expect(dups).toHaveLength(3);
  });
  it("lab extremes build and tile", () => {
    for (const perda of [0, 30])
      for (const janela of [1, 8])
        for (const perderSegundo of [true, false]) {
          const r = lesson.build({ perderSegundo, perda, janela, rtt: 10, segmentos: 20 });
          expectTiles(r);
        }
    const small = lesson.build({ perderSegundo: true, perda: 0, janela: 2, rtt: 40, segmentos: 3 });
    expect(small.stats.timeouts).toBe(1);
    expect(small.labNotes?.join(" ")).toContain("timeout");
  });
});
