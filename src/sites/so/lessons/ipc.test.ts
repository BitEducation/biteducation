import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { copies, pipeRun, receiveOrder } from "../../../sim/os/ipc.ts";
import lesson from "./ipc.ts";

describe("lesson ipc", () => {
  it("matches the hand calculations (docs/revisao/so-ipc.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      firstBlock: 6,
      closeAt: 13,
      end: 27,
      blocked: 5,
      copied: 64,
      order: "alarme,pedido,log",
    });
    expectLabSweep(lesson, [
      { blocos: 6, capacidade: 6, leitura: 2 },
      { blocos: 12, capacidade: 2, leitura: 4 },
      { blocos: 12, capacidade: 6, leitura: 2 },
    ]);
  });

  it("blocks the writer when full and reports EOF only after the writer closes", () => {
    const t = pipeRun(3, 1, 2);
    expect(t.map((x) => [x.wrote ?? 0, x.read ?? 0, x.writerBlocked])).toEqual([
      [1, 0, false],
      [0, 1, true],
      [2, 0, false],
      [0, 2, true],
      [3, 0, false],
      [0, 3, false],
      [0, 0, false],
      [0, 0, false],
    ]);
    expect(t[t.length - 1]?.eof).toBe(true);
    expect(
      receiveOrder([
        { text: "a", prio: 2 },
        { text: "b", prio: 2 },
        { text: "c", prio: 3 },
      ]).map((m) => m.text),
    ).toEqual(["c", "a", "b"]);
    expect([copies("pipe", 10), copies("compartilhada", 10)]).toEqual([20, 0]);
  });
});
