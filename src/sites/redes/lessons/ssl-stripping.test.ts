import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { firstHop } from "../../../sim/net/strip.ts";
import lesson from "./ssl-stripping.ts";

describe("lesson ssl-stripping", () => {
  it("matches the hand calculations (docs/revisao/redes-ssl-stripping.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ strippable: 1, scheme: "http", days: 365 });
    expectLabSweep(lesson, [
      { hsts: true, visitou: true, preload: false, dias: 1 },
      { hsts: false, visitou: true, preload: true, dias: 730 },
      { hsts: false, visitou: false, preload: false, dias: 365 },
    ]);
  });

  it("only a stored policy or the preload list closes the opening", () => {
    expect(firstHop({ hsts: true, visited: false, preload: false }).strippable).toBe(true);
    expect(firstHop({ hsts: false, visited: true, preload: false }).strippable).toBe(true);
    expect(firstHop({ hsts: true, visited: true, preload: false }).strippable).toBe(false);
    expect(firstHop({ hsts: false, visited: false, preload: true }).strippable).toBe(false);
  });
});
