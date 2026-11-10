import { describe, expect, it } from "vitest";
import {
  expectDeterministic,
  expectFramesValid,
  expectLabSweep,
  expectTiles,
} from "../../../../tests/lesson-checks.ts";
import { expectChecksums } from "../../../../tests/net-checks.ts";
import { xorAddress } from "../../../sim/net/stun.ts";
import lesson from "./webrtc.ts";

describe("lesson webrtc", () => {
  it("goes direct behind a cone NAT and through TURN behind a symmetric one", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    expect(run.stats.sym).toBeFalsy();
    expect(expectChecksums(run)).toBeGreaterThan(0);
    const sym = lesson.build({ ...lesson.params.defaults, simetrico: true });
    expectTiles(sym);
    expect(sym.stats.sym).toBeTruthy();
    expectLabSweep(lesson, [{ simetrico: true }, { simetrico: false }]);
  });

  it("XORs the mapped address with the magic cookie (RFC 8489 §14.2)", () => {
    // hand check: 40050 = 0x9C72 ^ 0x2112 = 0xBD60; C6 33 64 07 ^ 21 12 A4 42 = E7 21 C0 45
    expect(xorAddress("198.51.100.7", 40050)).toEqual([0, 1, 0xbd, 0x60, 0xe7, 0x21, 0xc0, 0x45]);
  });
});
