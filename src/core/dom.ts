/**
 * Minimal templating with escaping by default.
 * Every interpolated value is escaped unless it is a SafeHtml produced by html`` or raw().
 * raw() is only for strings owned by the code (icons), never for content or URL input.
 */

const SAFE = Symbol("safe-html");

export interface SafeHtml {
  readonly [SAFE]: true;
  readonly value: string;
}

type Interp = SafeHtml | string | number | boolean | null | undefined | readonly Interp[];

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

function isSafe(v: unknown): v is SafeHtml {
  return typeof v === "object" && v !== null && SAFE in v;
}

function toHtml(v: Interp): string {
  if (v === null || v === undefined || v === false) return "";
  if (Array.isArray(v)) return v.map((x) => toHtml(x as Interp)).join("");
  if (isSafe(v)) return v.value;
  return escapeHtml(String(v));
}

export function html(strings: TemplateStringsArray, ...values: Interp[]): SafeHtml {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) out += toHtml(values[i]) + (strings[i + 1] ?? "");
  return { [SAFE]: true, value: out };
}

export function raw(trusted: string): SafeHtml {
  return { [SAFE]: true, value: trusted };
}

export function render(target: Element, content: SafeHtml): void {
  // The only innerHTML sink of the app: content is always a SafeHtml built from escaped parts.
  target.innerHTML = content.value;
  applyVars(target);
}

const VAR_VALUE = /^[a-z0-9\-().%,# ]+$/i;

/**
 * CSS custom properties cannot be set through style="" under our CSP, so templates declare
 * data-v="--c:var(--role-a);--w:4" and this function applies them through the CSSOM.
 */
export function applyVars(root: Element): void {
  const nodes = root.querySelectorAll<HTMLElement | SVGElement>("[data-v]");
  for (const el of nodes) {
    const spec = el.getAttribute("data-v") ?? "";
    for (const part of spec.split(";")) {
      const idx = part.indexOf(":");
      if (idx < 0) continue;
      const name = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (/^--[a-z0-9-]+$/.test(name) && VAR_VALUE.test(value)) el.style.setProperty(name, value);
    }
  }
}

export function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Elemento não encontrado: ${sel}`);
  return el;
}

export function $$<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] {
  return [...root.querySelectorAll<T>(sel)];
}

/** Delegated listener: handler receives the closest element matching selector. */
export function on<K extends keyof HTMLElementEventMap>(
  root: Element | Document,
  type: K,
  selector: string,
  handler: (el: HTMLElement, ev: HTMLElementEventMap[K]) => void,
): () => void {
  const listener = (ev: Event) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const match = target.closest<HTMLElement>(selector);
    if (match && (root instanceof Document || root.contains(match)))
      handler(match, ev as HTMLElementEventMap[K]);
  };
  root.addEventListener(type, listener);
  return () => root.removeEventListener(type, listener);
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Tiny markdown subset for narrative text: **bold**, `code`, [[term]] and paragraphs. */
export function richText(text: string, termLabel: (id: string) => string | null): SafeHtml {
  const paragraphs = text.split(/\n{2,}/).map((p) => {
    const parts: string[] = [];
    const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g;
    let last = 0;
    for (const m of p.matchAll(re)) {
      parts.push(escapeHtml(p.slice(last, m.index)));
      if (m[1] !== undefined) parts.push(`<strong>${escapeHtml(m[1])}</strong>`);
      else if (m[2] !== undefined) parts.push(`<code>${escapeHtml(m[2])}</code>`);
      else if (m[3] !== undefined) {
        const label = m[4] ?? termLabel(m[3]) ?? m[3];
        parts.push(
          `<button type="button" class="term" data-term="${escapeHtml(m[3])}">${escapeHtml(label)}</button>`,
        );
      }
      last = (m.index ?? 0) + m[0].length;
    }
    parts.push(escapeHtml(p.slice(last)));
    return `<p>${parts.join("")}</p>`;
  });
  return raw(paragraphs.join(""));
}

/** Plain-text version of richText, for prerendered pages, search and aria labels. */
export function plainText(text: string, termLabel: (id: string) => string | null): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(
      /\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g,
      (_m, id: string, label?: string) => label ?? termLabel(id) ?? id,
    );
}
