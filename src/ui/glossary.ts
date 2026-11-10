import type { GlossaryEntry } from "../contracts/types.ts";
import { html, render } from "../core/dom.ts";

/** Popover for [[term]] buttons. One popover at a time, closed by Esc, blur or click outside. */
export function bindGlossary(root: HTMLElement, entries: readonly GlossaryEntry[]): () => void {
  const pop = document.createElement("div");
  pop.className = "popover";
  pop.setAttribute("role", "tooltip");
  pop.id = "glossary-pop";
  pop.hidden = true;
  document.body.append(pop);
  let owner: HTMLElement | null = null;

  const show = (btn: HTMLElement) => {
    const entry = entries.find((e) => e.id === btn.dataset.term);
    if (!entry) return;
    owner = btn;
    render(pop, html`<b>${entry.term}</b>${entry.def}`);
    pop.hidden = false;
    btn.setAttribute("aria-describedby", pop.id);
    const r = btn.getBoundingClientRect();
    const w = Math.min(320, window.innerWidth - 16);
    pop.style.setProperty("max-width", `${w}px`);
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
    const below = r.bottom + 8;
    pop.style.setProperty("left", `${left}px`);
    pop.style.setProperty("top", `${below}px`);
    const ph = pop.getBoundingClientRect().height;
    if (below + ph > window.innerHeight - 8) pop.style.setProperty("top", `${Math.max(8, r.top - ph - 8)}px`);
  };
  const hide = () => {
    pop.hidden = true;
    owner?.removeAttribute("aria-describedby");
    owner = null;
  };
  const term = (e: Event) => (e.target as Element | null)?.closest?.<HTMLElement>(".term") ?? null;
  const onOver = (e: Event) => {
    const t = term(e);
    if (t) show(t);
  };
  const onOut = (e: Event) => {
    if (term(e)) hide();
  };
  const onClick = (e: Event) => {
    const t = term(e);
    if (t) {
      e.preventDefault();
      if (owner === t && !pop.hidden) hide();
      else show(t);
    } else if (!pop.contains(e.target as Node)) hide();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !pop.hidden) {
      e.stopPropagation();
      hide();
    }
  };
  root.addEventListener("mouseover", onOver);
  root.addEventListener("mouseout", onOut);
  root.addEventListener("focusin", onOver);
  root.addEventListener("focusout", onOut);
  document.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey, true);
  return () => {
    root.removeEventListener("mouseover", onOver);
    root.removeEventListener("mouseout", onOut);
    root.removeEventListener("focusin", onOver);
    root.removeEventListener("focusout", onOut);
    document.removeEventListener("click", onClick);
    document.removeEventListener("keydown", onKey, true);
    pop.remove();
  };
}
