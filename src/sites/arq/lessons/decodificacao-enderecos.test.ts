import { describe, expect, it } from "vitest";
import { expectDeterministic, expectTiles } from "../../../../tests/lesson-checks.ts";
import lesson from "./decodificacao-enderecos.ts";

describe("lesson decodificacao-enderecos", () => {
  it("matches the hand count (docs/revisao/arq-decodificacao-enderecos.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ eprom: 16, ram: 8, pio: 4096, ghosts: 3 });
  });
});
