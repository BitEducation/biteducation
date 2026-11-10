import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decodeLab, encodeLab, lessonUrl, parseRoute, sanitizeParams } from "./router.ts";

describe("parseRoute", () => {
  it("parses site, lesson and step", () => {
    expect(parseRoute({ pathname: "/so/round-robin/", search: "?passo=s2-quantum" }, "/")).toEqual({
      site: "so",
      slug: "round-robin",
      step: "s2-quantum",
      lab: null,
    });
  });
  it("falls back to the hub and ignores malformed parts", () => {
    expect(parseRoute({ pathname: "/x/y", search: "" }, "/").site).toBe("hub");
    const r = parseRoute({ pathname: "/so/<script>/", search: "?passo=../../etc" }, "/");
    expect(r.slug).toBeNull();
    expect(r.step).toBeNull();
  });
  it("respects a non-root base", () => {
    expect(parseRoute({ pathname: "/repo/arq/pipeline/index.html", search: "" }, "/repo/").slug).toBe(
      "pipeline",
    );
  });
});

describe("lab encoding", () => {
  it("round-trips flat params", () => {
    const p = { quantum: 3, policy: "lru", fwd: true, refs: "1 2 3 4 é" };
    expect(decodeLab(encodeLab(p))).toEqual(p);
  });
  it("rejects nested objects, huge input and garbage", () => {
    expect(decodeLab(encodeLab({ a: 1 } as never).replace(/./, "!"))).toBeNull();
    expect(decodeLab("A".repeat(2000))).toBeNull();
    expect(decodeLab(Buffer.from(JSON.stringify({ a: { b: 1 } })).toString("base64url"))).toBeNull();
    expect(
      decodeLab(Buffer.from(JSON.stringify({ __proto__x: 1, "bad key": 2 })).toString("base64url")),
    ).toBeNull();
  });
  it("never throws on arbitrary strings", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 300 }),
        (s) => decodeLab(s) === null || typeof decodeLab(s) === "object",
      ),
    );
  });
  it("lessonUrl builds a pages-friendly path", () => {
    expect(lessonUrl("so", "round-robin", { step: "s1-x" })).toBe("/so/round-robin/?passo=s1-x");
  });
});

describe("sanitizeParams", () => {
  const fields = [
    { key: "q", kind: "int" as const, label: "q", min: 1, max: 20 },
    { key: "pol", kind: "choice" as const, label: "p", options: [{ value: "lru", label: "LRU" }] },
    { key: "refs", kind: "list" as const, label: "r", maxItems: 4, pattern: "[0-9]{1,2}", placeholder: "" },
  ];
  const defaults = { q: 3, pol: "lru", refs: "1 2" };
  it("keeps valid values and drops invalid ones", () => {
    const { params, changed } = sanitizeParams(
      { q: 50, pol: "evil", refs: "1 2 3", extra: 1 },
      defaults,
      fields,
    );
    expect(params).toEqual({ q: 3, pol: "lru", refs: "1 2 3" });
    expect(changed).toBe(true);
  });
  it("rejects lists that are too long or malformed", () => {
    expect(sanitizeParams({ refs: "1 2 3 4 5" }, defaults, fields).params.refs).toBe("1 2");
    expect(sanitizeParams({ refs: "1 x" }, defaults, fields).params.refs).toBe("1 2");
  });
});

describe("sanitizeParams: text fields", () => {
  const fields = [
    {
      key: "asm",
      kind: "text" as const,
      label: "x",
      maxLength: 20,
      pattern: "[\\x20-\\x7E\\n]*",
      placeholder: "",
    },
  ];
  it("accepts printable text within the limit", () => {
    expect(sanitizeParams({ asm: "add x5, x6, x7" }, { asm: "" }, fields)).toEqual({
      params: { asm: "add x5, x6, x7" },
      changed: true,
    });
  });
  it("rejects control characters and long values", () => {
    expect(sanitizeParams({ asm: "a\u0000b" }, { asm: "" }, fields).changed).toBe(false);
    expect(sanitizeParams({ asm: "x".repeat(21) }, { asm: "" }, fields).changed).toBe(false);
  });
});
