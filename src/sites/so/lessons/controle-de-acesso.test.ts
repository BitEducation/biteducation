import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { acl, caps, modeString, unixCheck } from "../../../sim/os/access.ts";
import lesson from "./controle-de-acesso.ts";

describe("lesson controle-de-acesso", () => {
  it("matches the hand calculations (docs/revisao/so-controle-de-acesso.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({
      mode: "rw-r-----",
      granted: 2,
      brunoWrite: "não",
      ownerOdd: "não",
      othersOdd: "sim",
      filled: 8,
    });
    expectLabSweep(lesson, [
      { dono: 0, grupo: 0, outros: 0 },
      { dono: 7, grupo: 7, outros: 7 },
      { dono: 4, grupo: 6, outros: 2 },
    ]);
  });

  it("uses exactly one class of bits", () => {
    const f = { owner: "ana", group: "prof", mode: 0o604 };
    const bruno = { name: "bruno", groups: ["prof"] };
    // Bruno is in the group, so the generous "others" bits do not apply to him.
    expect(unixCheck(f, bruno, "r")).toEqual({ cls: "grupo", bits: "---", ok: false });
    expect(unixCheck(f, { name: "eva", groups: [] }, "r").ok).toBe(true);
    expect(modeString(0o755)).toBe("rwxr-xr-x");
    expect(acl(0)).toEqual(["ana: rw", "bruno: r", "backup: r"]);
    expect(caps("backup")).toEqual(["notas.txt: r", "prova.pdf: r"]);
  });
});
