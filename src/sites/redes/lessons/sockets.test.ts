import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./sockets.ts";

describe("lesson sockets", () => {
  it("matches the hand trace (docs/revisao/redes-sockets.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ ignored: "Rui", sockets: 3, lastFd: 5 });
  });

  it("a deeper backlog queues everyone", () => {
    expectLabSweep(lesson, [{ backlog: 1 }, { backlog: 3 }]);
    expect(lesson.build({ backlog: 1 }).stats.ignored).toBe("Caio,Rui");
    expect(lesson.build({ backlog: 3 }).stats.ignored).toBe("nenhum");
  });
});
