// @vitest-environment happy-dom
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyVars, escapeHtml, html, plainText, raw, render, richText } from "./dom.ts";

describe("html``", () => {
  it("escapes every interpolation by default", () => {
    const evil = `<img src=x onerror="alert(1)">'`;
    const out = html`<p title="${evil}">${evil}</p>`.value;
    expect(out).not.toContain("<img");
    expect(out).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;");
  });

  it("keeps nested SafeHtml and joins arrays", () => {
    const items = ["a<", "b"].map((x) => html`<li>${x}</li>`);
    expect(html`<ul>${items}</ul>`.value).toBe("<ul><li>a&lt;</li><li>b</li></ul>");
  });

  it("never lets arbitrary strings produce tags", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const out = html`<div>${s}</div>`.value;
        return !out.slice(5, -6).includes("<");
      }),
    );
  });

  it("render() does not execute injected markup", () => {
    const el = document.createElement("div");
    render(el, html`<span>${'<script>window.__x = 1</script><img src=x onerror="window.__x=2">'}</span>`);
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("img")).toBeNull();
    expect((window as unknown as { __x?: number }).__x).toBeUndefined();
  });

  it("raw() is the explicit escape hatch", () => {
    expect(html`${raw("<b>x</b>")}`.value).toBe("<b>x</b>");
  });
});

describe("applyVars", () => {
  it("sets allowed custom properties and ignores the rest", () => {
    const el = document.createElement("div");
    el.innerHTML = '<i data-v="--c:var(--role-a);--w:4;color:red;--x:url(javascript:1)"></i>';
    applyVars(el);
    const i = el.querySelector("i") as HTMLElement;
    expect(i.style.getPropertyValue("--c")).toBe("var(--role-a)");
    expect(i.style.getPropertyValue("--w")).toBe("4");
    expect(i.style.getPropertyValue("color")).toBe("");
    expect(i.style.getPropertyValue("--x")).toBe("");
  });
});

describe("richText", () => {
  const label = (id: string) => (id === "tlb" ? "TLB" : null);
  it("supports bold, code, terms and paragraphs, escaping the rest", () => {
    const out = richText("Use **a** e `b<c>`\n\nNa [[tlb]] <x>", label).value;
    expect(out).toBe(
      '<p>Use <strong>a</strong> e <code>b&lt;c&gt;</code></p><p>Na <button type="button" class="term" data-term="tlb">TLB</button> &lt;x&gt;</p>',
    );
  });
  it("plainText strips markup", () => {
    expect(plainText("**a** `b` [[tlb]] [[x|y]]", label)).toBe("a b TLB y");
  });
  it("escapeHtml handles quotes", () => {
    expect(escapeHtml(`"'`)).toBe("&quot;&#39;");
  });
});
