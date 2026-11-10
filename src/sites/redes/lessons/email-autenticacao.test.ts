import { describe, expect, it } from "vitest";
import { expectDeterministic, expectLabSweep, expectTiles } from "../../../../tests/lesson-checks.ts";
import { dmarc, type Mail, mails } from "../../../sim/net/mailauth.ts";
import lesson from "./email-autenticacao.ts";

describe("lesson email-autenticacao", () => {
  it("matches the hand calculations (docs/revisao/redes-email-autenticacao.md)", () => {
    const run = lesson.build(lesson.params.defaults);
    expectTiles(run);
    expectDeterministic(lesson);
    expect(run.stats).toEqual({ m1: 1, m2: "rejeitar", m3: 0, spf2: "pass" });
    expectLabSweep(lesson, [
      { politica: "none", rodape: "nao" },
      { politica: "quarantine", rodape: "sim" },
    ]);
  });

  it("alignment decides, not a bare SPF pass", () => {
    const [m1, m2, m3] = mails(false) as [Mail, Mail, Mail];
    expect(dmarc(m1, "reject")).toMatchObject({ spf: "pass", dkim: "pass", ok: true });
    expect(dmarc(m2, "quarantine")).toMatchObject({
      spf: "pass",
      spfAligned: false,
      ok: false,
      action: "quarentena",
    });
    expect(dmarc(m3, "reject")).toMatchObject({ spf: "fail", dkim: "pass", ok: true });
    expect(dmarc((mails(true) as [Mail, Mail, Mail])[2], "reject")).toMatchObject({
      dkim: "fail",
      ok: false,
    });
  });
});
