import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { textRun, utf8, utf16 } from "../../../sim/arch/text.ts";
import lesson from "./texto-unicode.ts";

describe("lesson texto-unicode", () => {
  it("matches the hand calculations (docs/revisao/arq-texto-unicode.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ chars: 6, utf8: 12, utf16: 7, mojibake: "OlÃ¡ â‚¬ðŸ˜€" });
    expectLabSweep(lesson, [{ texto: "ação" }, { texto: "naïve" }, { texto: "日本" }]);
  });

  it("agrees with the platform encoder", () => {
    for (const s of ["Olá €😀", "ação", "日本", "ok"])
      expect(textRun(s).bytes).toEqual([...new TextEncoder().encode(s)]);
    expect(utf8(0xe1)).toEqual([0xc3, 0xa1]);
    expect(utf16(0x1f600)).toEqual([0xd83d, 0xde00]);
    expect(textRun("Olá €😀").utf16Units).toBe("Olá €😀".length);
  });
});
