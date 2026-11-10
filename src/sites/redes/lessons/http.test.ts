import { describe, expect, it } from "vitest";
import { expectDeterministic, expectFramesValid, expectTiles } from "../../../../tests/lesson-checks.ts";
import { expectChecksums } from "../../../../tests/net-checks.ts";
import lesson from "./http.ts";

describe("lesson http", () => {
  const run = lesson.build(lesson.params.defaults);
  it("tiles, is deterministic and every checksum verifies", () => {
    expectTiles(run);
    expectFramesValid(run);
    expectDeterministic(lesson);
    expect(expectChecksums(run)).toBe(Object.keys(run.frames).length);
  });
});

describe("http numbers", () => {
  it("Content-Length matches the body and the 304 has no body", async () => {
    const { BODY } = await import("./http.ts");
    const run = lesson.build(lesson.params.defaults);
    const txt = (id: string) => {
      const f = run.frames[id];
      const h = f?.layers.find((l) => l.id === "http");
      return String.fromCharCode(...((f ? f.data.slice(h?.from, h?.to) : []) as number[]));
    };
    expect(txt("f-res1")).toContain(`Content-Length: ${BODY.length}\r\n`);
    expect(txt("f-res1").endsWith(BODY)).toBe(true);
    expect(txt("f-res3").endsWith("\r\n\r\n")).toBe(true);
  });
  it("the second request reuses the connection: its sequence continues the first", () => {
    const run = lesson.build(lesson.params.defaults);
    const seq = (id: string) => {
      const d = run.frames[id]?.data as number[];
      return ((d[24] ?? 0) * 2 ** 24 + (d[25] ?? 0) * 65536 + (d[26] ?? 0) * 256 + (d[27] ?? 0)) >>> 0;
    };
    const len = (id: string) => {
      const f = run.frames[id];
      const h = f?.layers.find((l) => l.id === "http");
      return (h?.to ?? 0) - (h?.from ?? 0);
    };
    expect(seq("f-req2")).toBe((seq("f-req1") + len("f-req1")) >>> 0);
  });
});
