import { html, render } from "../core/dom.ts";
import { t } from "../core/i18n.ts";
import { type SearchItem, search } from "../core/search.ts";
import { icons } from "./icons.ts";

let dialog: HTMLDialogElement | null = null;

/** Command palette. getItems is called once per opening (lazy index). */
export function openPalette(getItems: () => Promise<SearchItem[]>, navigate: (url: string) => void): void {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "dialog palette";
    dialog.setAttribute("aria-label", t("search.label"));
    document.body.append(dialog);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog?.close();
    });
  }
  const d = dialog;
  render(
    d,
    html`<div class="palette-field">${icons.search()}
      <input class="palette-input" type="search" role="combobox" aria-expanded="true" aria-controls="palette-list"
        aria-autocomplete="list" autocomplete="off" spellcheck="false" maxlength="80" placeholder="${t("search.placeholder")}"/>
      <kbd>Esc</kbd></div>
      <ul class="palette-list" id="palette-list" role="listbox" aria-label="${t("search.label")}"></ul>
      <p class="palette-empty" hidden>${t("search.empty")}</p>
      <div class="palette-foot"><span><kbd>↑</kbd><kbd>↓</kbd> ${t("search.move")}</span><span><kbd>Enter</kbd> ${t("search.openHint")}</span></div>`,
  );
  const input = d.querySelector("input") as HTMLInputElement;
  const list = d.querySelector(".palette-list") as HTMLUListElement;
  const empty = d.querySelector(".palette-empty") as HTMLElement;
  let items: SearchItem[] = [];
  let results: SearchItem[] = [];
  let active = 0;

  const draw = () => {
    results = search(items, input.value);
    active = Math.min(active, Math.max(0, results.length - 1));
    empty.hidden = results.length > 0 || items.length === 0;
    render(
      list,
      html`${results.map(
        (r, i) => html`<li role="option" id="pal-${i}" aria-selected="${i === active}" data-i="${i}">
          <span class="pill">${t(`search.kind.${r.kind}`)}</span>
          <span class="pal-text"><b>${r.title}</b><small>${r.sub}</small></span></li>`,
      )}`,
    );
    input.setAttribute("aria-activedescendant", results.length ? `pal-${active}` : "");
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };
  const go = (i: number) => {
    const r = results[i];
    if (!r) return;
    d.close();
    navigate(r.url);
  };
  input.addEventListener("input", () => {
    active = 0;
    draw();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(results.length - 1, active + 1);
      draw();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(0, active - 1);
      draw();
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(active);
    }
  });
  list.addEventListener("click", (e) => {
    const li = (e.target as Element).closest<HTMLElement>("[data-i]");
    if (li) go(Number(li.dataset.i));
  });
  d.showModal();
  input.focus();
  getItems().then(
    (loaded) => {
      items = loaded;
      draw();
    },
    () => {
      items = [];
      empty.hidden = false;
    },
  );
}
