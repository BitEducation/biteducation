import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { h8, human, passwordsRun } from "../../../sim/os/passwords.ts";
import lesson from "./senhas.ts";

describe("lesson senhas", () => {
  it("matches the hand calculations (docs/revisao/so-senhas.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ crackedPlain: 3, crackedTable: 0, perUser: 3, guesses: 20, seconds: 41943 });
    expectLabSweep(lesson, [{ custo: 0 }, { custo: 10 }, { custo: 24 }]);
  });

  it("real SHA-1 prefixes and readable durations", () => {
    expect(h8("123456")).toBe("7c4a8d09");
    expect(human(passwordsRun(0).seconds)).toBe("0,04 s");
    expect(human(passwordsRun(14).seconds)).toBe("11 min");
    expect(human(passwordsRun(24).seconds)).toBe("7,8 dias");
  });
});
