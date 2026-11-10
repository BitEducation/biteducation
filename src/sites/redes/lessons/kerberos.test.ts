import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { kerberosRun } from "../../../sim/net/kerberos.ts";
import lesson from "./kerberos.ts";

describe("lesson kerberos", () => {
  it("matches the hand calculations (docs/revisao/redes-kerberos.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ tgt: 1, accepted: 1, total: 14 });
    expectLabSweep(lesson, [
      { relogio: 6, senha: "certa", servicos: 1 },
      { relogio: 0, senha: "errada", servicos: 6 },
      { relogio: 10, senha: "errada", servicos: 2 },
    ]);
  });

  it("skew limit and message count", () => {
    expect(kerberosRun(5, true, 1)).toMatchObject({ accepted: true, total: 6 });
    expect(kerberosRun(6, true, 1).accepted).toBe(false);
    expect(kerberosRun(0, false, 1).accepted).toBe(false);
  });
});
