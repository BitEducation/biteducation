import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

/** Collects custom properties for a selector (also inside selector lists), later wins. */
function block(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const sels = (m[1] ?? "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(",")
      .map((x) => x.trim());
    if (!sels.includes(selector)) continue;
    for (const d of (m[2] ?? "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
      out[d[1] as string] = (d[2] as string).trim();
  }
  return out;
}

function theme(site: string, dark: boolean): Record<string, string> {
  const base = block(":root");
  const siteBlock = site === "hub" ? {} : block(`:root[data-site="${site}"]`);
  const siteDark = site === "hub" ? {} : block(`:root[data-site="${site}"][data-theme="dark"]`);
  const merged = dark
    ? { ...base, ...block(':root[data-theme="dark"]'), ...siteBlock, ...siteDark }
    : { ...base, ...siteBlock };
  // Resolve var(--x) against the merged theme, as the cascade does at computed time.
  const resolve = (v: string, depth = 0): string => {
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    return m && depth < 8 ? resolve(merged[m[1] as string] ?? "", depth + 1) : v;
  };
  return Object.fromEntries(Object.entries(merged).map(([k, v]) => [k, resolve(v)]));
}

/** Linear sRGB channels of a #rrggbb or oklch(L C H) value (out-of-gamut values clamped). */
function linearRgb(color: string): [number, number, number] {
  const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(color);
  if (ok) {
    const [L, C, H] = [Number(ok[1]), Number(ok[2]), (Number(ok[3]) * Math.PI) / 180];
    const [a, b] = [C * Math.cos(H), C * Math.sin(H)];
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return [
      clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ];
  }
  const h = color.replace("#", "");
  const ch = [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return [lin[0] ?? 0, lin[1] ?? 0, lin[2] ?? 0];
}

function luminance(color: string): number {
  const [r, g, b] = linearRgb(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

const TEXT_PAIRS: [fg: string, bg: string][] = [
  ["--ink", "--bg"],
  ["--ink", "--surface"],
  ["--ink", "--surface-2"],
  ["--ink-2", "--bg"],
  ["--ink-2", "--surface"],
  ["--ink-3", "--bg"],
  ["--ink-3", "--surface"],
  ["--on-accent", "--accent"],
  ["--accent", "--surface"],
  ["--accent", "--bg"],
  ["--ink", "--accent-soft"],
];
const GRAPHIC_ROLES = [
  "--role-a",
  "--role-b",
  "--role-ctrl",
  "--role-crypto",
  "--role-bad",
  "--role-muted",
  "--role-warn",
  "--series-3",
  "--series-4",
  "--series-5",
  "--series-6",
  "--line-strong",
  "--focus",
  "--redes",
  "--so",
  "--arq",
];

describe("design tokens", () => {
  for (const site of ["hub", "redes", "so", "arq"]) {
    for (const dark of [false, true]) {
      const t = theme(site, dark);
      const label = `${site}/${dark ? "dark" : "light"}`;
      it(`${label}: text pairs reach 4.5:1`, () => {
        for (const [fg, bg] of TEXT_PAIRS) {
          const ratio = contrast(t[fg] ?? "", t[bg] ?? "");
          expect(ratio, `${fg} on ${bg} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
        }
      });
      it(`${label}: graphic roles reach 3:1 on the surface`, () => {
        for (const role of GRAPHIC_ROLES) {
          const ratio = contrast(t[role] ?? "", t["--surface"] ?? "");
          expect(ratio, `${role} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
        }
      });
    }
  }
});
