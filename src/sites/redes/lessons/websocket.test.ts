import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import { expectChecksums } from "../../../../tests/net-checks.ts";
import lesson, { acceptOf } from "./websocket.ts";

describe("lesson websocket", () => {
  const run = lesson.build(lesson.params.defaults);
  it("computes the accept from the key and unmasks to the original text", () => {
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    expect(acceptOf("dGhlIHNhbXBsZSBub25jZQ==")).toBe("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
    expect(run.stats.accept).toBe(acceptOf(String(run.stats.key)));
    const f = run.frames["f-3"];
    const ws = f?.layers.find((l) => l.id === "ws");
    const d = f?.data.slice(ws?.from, ws?.to) as number[];
    const mask = d.slice(2, 6);
    const text = String.fromCharCode(...d.slice(6).map((x, i) => x ^ (mask[i % 4] ?? 0)));
    expect(text).toBe('{"seguir":["sala-2","sala-3"]}');
    expect(expectChecksums(run)).toBe(Object.keys(run.frames).length);
  });
});
