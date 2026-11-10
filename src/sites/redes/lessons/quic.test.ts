import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import { varint } from "../../../sim/net/quic.ts";
import lesson, { MIN_INITIAL } from "./quic.ts";

describe("lesson quic", () => {
  const run = lesson.build(lesson.params.defaults);
  it("pads the client Initial to 1200 bytes and respects the 3x limit", () => {
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    const f = run.frames["f-c-initial"];
    const q = f?.layers.find((l) => l.id === "quic");
    expect((q?.to ?? 0) - (q?.from ?? 0)).toBe(MIN_INITIAL);
    expect(Number(run.stats.sent)).toBeLessThanOrEqual(3 * MIN_INITIAL);
  });
  it("varints use the 2-bit length prefix (RFC 9000 §16)", () => {
    expect(varint(37)).toEqual([0x25]);
    expect(varint(15293)).toEqual([0x7b, 0xbd]);
    expect(varint(494878333)).toEqual([0x9d, 0x7f, 0x3e, 0x7d]);
  });
});
