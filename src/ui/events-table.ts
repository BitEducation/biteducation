import type { EventColumn, LessonRun } from "../contracts/types.ts";
import { html, render } from "../core/dom.ts";
import { t } from "../core/i18n.ts";

export interface EventsTable {
  update(cursor: number, selected: number | null): void;
  toText(cursor: number): string;
}

/** TSV cell: tabs and line breaks would shift the columns in a spreadsheet. */
const cell = (s: string) => s.replace(/[\t\r\n]+/g, " ");

/** Rows appear as their events are played; clicking (or Enter) opens the inspector. */
export function createEventsTable(
  host: HTMLElement,
  columns: EventColumn[],
  run: LessonRun,
  onPick: (index: number) => void,
): EventsTable {
  const rows = run.trace.map((ev, index) => ({ ev, index })).filter((r) => r.ev.row);
  render(
    host,
    html`<table class="ev-table">
      <caption class="sr-only">${t("events.caption")}</caption>
      <thead><tr><th scope="col">Nº</th>${columns.map((c) => html`<th scope="col">${c.label}</th>`)}</tr></thead>
      <tbody></tbody></table><p class="ev-empty">${t("events.empty")}</p>`,
  );
  const tbody = host.querySelector("tbody") as HTMLTableSectionElement;
  const empty = host.querySelector(".ev-empty") as HTMLElement;
  let shown = -1;
  let shownSelected: number | null = null;

  const rowHtml = (r: (typeof rows)[number], n: number, isNew: boolean, sel: boolean) =>
    html`<tr data-index="${r.index}" tabindex="0" aria-selected="${sel}" class="role-${r.ev.role}${isNew ? " is-new" : ""}" data-v="--c:var(--${roleVar(r.ev.role)})">
      <td data-label="Nº"><span class="ev-n">${n}</span></td>
      ${columns.map((c, i) => html`<td data-label="${c.label}">${r.ev.row?.cols[c.key] ?? ""}${i === columns.length - 1 && r.ev.lost ? html` <span class="flag">✕ ${t("events.lost")}</span>` : ""}</td>`)}
    </tr>`;

  host.addEventListener("click", (e) => {
    const tr = (e.target as Element).closest<HTMLElement>("tr[data-index]");
    if (tr) onPick(Number(tr.dataset.index));
  });
  host.addEventListener("keydown", (e) => {
    const tr = (e.target as Element).closest<HTMLElement>("tr[data-index]");
    if (!tr) return;
    if (e.key === "Enter") {
      e.preventDefault();
      onPick(Number(tr.dataset.index));
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const sib = (
        e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling
      ) as HTMLElement | null;
      sib?.focus();
    }
  });

  return {
    update(cursor, selected) {
      const visible = rows.filter((r) => r.index < cursor);
      if (visible.length === shown && selected === shownSelected) return;
      const grew = visible.length > shown && shown >= 0;
      const prev = Math.max(0, shown);
      render(
        tbody,
        html`${visible.map((r, i) => rowHtml(r, i + 1, grew && i >= prev, r.index === selected))}`,
      );
      empty.hidden = visible.length > 0;
      if (grew) {
        const scroller = host.closest(".events-scroll");
        const last = tbody.lastElementChild as HTMLElement | null;
        if (scroller && last) scroller.scrollTop = last.offsetTop;
      }
      shown = visible.length;
      shownSelected = selected;
    },
    toText(cursor) {
      const head = ["Nº", ...columns.map((c) => c.label)].join("\t");
      const body = rows
        .filter((r) => r.index < cursor)
        .map((r, i) => [String(i + 1), ...columns.map((c) => cell(r.ev.row?.cols[c.key] ?? ""))].join("\t"));
      return [head, ...body].join("\n");
    },
  };
}

export function roleVar(role: string): string {
  return role.startsWith("s") && role.length === 2 ? `series-${role.slice(1)}` : `role-${role}`;
}
