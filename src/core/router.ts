import type { ParamField, Params, SiteId } from "../contracts/types.ts";

export interface Route {
  site: SiteId | "hub";
  slug: string | null;
  step: string | null;
  lab: Params | null;
  /** ?prever=1: open the step asking its prediction again (review), instead of skipping it. */
  ask?: boolean;
}

const SITES: readonly SiteId[] = ["redes", "so", "arq"];
const SLUG = /^[a-z0-9-]{1,64}$/;
const STEP = /^s\d{1,2}-[a-z0-9-]{1,48}$/;
const MAX_LAB = 1024;

function basePath(): string {
  const b = import.meta.env?.BASE_URL ?? "/";
  return b.endsWith("/") ? b : `${b}/`;
}

export function parseRoute(loc: { pathname: string; search: string }, base = basePath()): Route {
  let path = loc.pathname.startsWith(base)
    ? loc.pathname.slice(base.length)
    : loc.pathname.replace(/^\//, "");
  path = path.replace(/index\.html$/, "").replace(/\/+$/, "");
  const [first, second] = path.split("/");
  const site = SITES.find((s) => s === first) ?? "hub";
  const slug = site !== "hub" && second && SLUG.test(second) ? second : null;
  const q = new URLSearchParams(loc.search);
  const stepRaw = q.get("passo");
  const step = slug && stepRaw && STEP.test(stepRaw) ? stepRaw : null;
  const lab = slug ? decodeLab(q.get("lab")) : null;
  return step && q.get("prever") === "1" ? { site, slug, step, lab, ask: true } : { site, slug, step, lab };
}

export function lessonUrl(
  site: SiteId,
  slug: string,
  opts: { step?: string | null; lab?: Params | null; ask?: boolean } = {},
): string {
  const q = new URLSearchParams();
  if (opts.step) q.set("passo", opts.step);
  if (opts.step && opts.ask) q.set("prever", "1");
  if (opts.lab) q.set("lab", encodeLab(opts.lab));
  const qs = q.toString();
  return `${basePath()}${site}/${slug}/${qs ? `?${qs}` : ""}`;
}

export function siteUrl(site: SiteId | "hub"): string {
  return site === "hub" ? basePath() : `${basePath()}${site}/`;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function encodeLab(p: Params): string {
  return toBase64Url(JSON.stringify(p));
}

/** Decodes untrusted input. Only flat objects of short primitives survive; fields are validated later. */
export function decodeLab(s: string | null): Params | null {
  if (!s || s.length > MAX_LAB || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(s));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const out: Params = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(k)) return null;
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
      else if (typeof v === "boolean") out[k] = v;
      else if (typeof v === "string" && v.length <= 400) out[k] = v;
      else return null;
    }
    return out;
  } catch {
    return null;
  }
}

/** Validates lab params against the lesson's fields; unknown or invalid keys fall back to defaults. */
export function sanitizeParams(
  input: Params,
  defaults: Params,
  fields: ParamField[] = [],
): { params: Params; changed: boolean } {
  const params: Params = { ...defaults };
  let changed = false;
  for (const f of fields) {
    const v = input[f.key];
    if (v === undefined) continue;
    let ok = false;
    if (f.kind === "int" && typeof v === "number") {
      ok = Number.isInteger(v) && v >= f.min && v <= f.max;
    } else if (f.kind === "choice" && typeof v === "string") {
      ok = f.options.some((o) => o.value === v);
    } else if (f.kind === "bool" && typeof v === "boolean") {
      ok = true;
    } else if (f.kind === "text" && typeof v === "string") {
      ok = v.length <= f.maxLength && new RegExp(`^(?:${f.pattern})$`).test(v);
    } else if (f.kind === "list" && typeof v === "string") {
      const items = v.split(/[\s,;]+/).filter(Boolean);
      const re = new RegExp(`^(?:${f.pattern})$`);
      ok = items.length > 0 && items.length <= f.maxItems && items.every((i) => re.test(i));
    }
    if (ok) {
      params[f.key] = v;
      if (v !== defaults[f.key]) changed = true;
    }
  }
  return { params, changed };
}
