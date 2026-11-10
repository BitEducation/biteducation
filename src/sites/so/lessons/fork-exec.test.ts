import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { boot, exec, exit, fork, reap, spawn, usedFrames, write } from "../../../sim/os/proc.ts";
import lesson from "./fork-exec.ts";

describe("lesson fork-exec", () => {
  it("matches the hand calculations (docs/revisao/so-fork-exec.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      child: 101,
      copies: 1,
      afterCow: 5,
      afterExec: 7,
      zombieFrames: 4,
      adopted: 1,
    });
    expectLabSweep(lesson, [
      { escritas: 0, paginasLs: 1 },
      { escritas: 3, paginasLs: 5 },
    ]);
  });

  it("copy-on-write copies a shared frame once and never leaks frames", () => {
    const k = boot(12);
    spawn(k, 100, 1, "sh", 4);
    const c = fork(k, 100);
    expect(usedFrames(k)).toBe(4);
    expect(write(k, c, 3).copied).toBe(true);
    expect(write(k, c, 3).copied).toBe(false);
    // the parent's frame is now private again
    expect(write(k, 100, 3).copied).toBe(false);
    exec(k, c, "ls", 2);
    expect(usedFrames(k)).toBe(6);
    exit(k, c, 7);
    expect(usedFrames(k)).toBe(4);
    expect(reap(k, 100)).toEqual({ pid: c, code: 7 });
    expect(reap(k, 100)).toBeNull();
  });
});
