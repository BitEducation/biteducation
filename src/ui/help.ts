import { html, render, type SafeHtml } from "../core/dom.ts";
import { t } from "../core/i18n.ts";
import { icons } from "./icons.ts";

const k = (...keys: string[]) => html`${keys.map((x, i) => html`${i ? " " : ""}<kbd>${x}</kbd>`)}`;

function groups(): [string, [SafeHtml, string][]][] {
  const mod = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
  return [
    [
      t("shortcuts.playback"),
      [
        [k("Espaço"), t("sc.play")],
        [k("→", "←"), t("sc.next")],
        [k("Shift →", "Shift ←"), t("sc.event")],
        [k("S"), t("sc.mode")],
        [k("1…9"), t("sc.goto")],
        [k("-", "="), t("sc.speed")],
        [k("R"), t("sc.restart")],
        [k("Esc"), t("sc.esc")],
      ],
    ],
    [
      t("shortcuts.panels"),
      [
        [k("I"), t("sc.inspector")],
        [k("E"), t("sc.events")],
        [k("L"), t("sc.index")],
        [k("P"), t("sc.present")],
        [k("F"), t("sc.fullscreen")],
        [k("T"), t("sc.theme")],
      ],
    ],
    [
      t("shortcuts.nav"),
      [
        [k(`${mod} K`, "/"), t("sc.search")],
        [k("J", "U"), t("sc.lesson")],
        [k("?"), t("sc.help")],
      ],
    ],
    [
      t("shortcuts.inspector"),
      [
        [k("←", "→"), t("sc.insNav")],
        [k("C"), t("sc.insCopy")],
      ],
    ],
  ];
}

let dialog: HTMLDialogElement | null = null;

export function openHelp(): void {
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.className = "dialog";
    dialog.setAttribute("aria-labelledby", "help-title");
    document.body.append(dialog);
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog || (e.target as Element).closest(".dialog-close")) dialog?.close();
    });
  }
  render(
    dialog,
    html`<div class="dialog-head"><h2 id="help-title">${t("help.title")}</h2>
      <button class="icon-btn dialog-close" type="button" aria-label="${t("close")}">${icons.close()}</button></div>
      <div class="dialog-body">${groups().map(
        ([title, rows]) => html`<section class="shortcut-group"><h3 class="micro">${title}</h3>
          <dl>${rows.map(([keys, label]) => html`<dt>${keys}</dt><dd>${label}</dd>`)}</dl></section>`,
      )}</div>`,
  );
  dialog.showModal();
}
