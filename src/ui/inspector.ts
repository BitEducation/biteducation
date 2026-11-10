import type { FieldNode, Frame } from "../contracts/types.ts";
import { html, render, type SafeHtml } from "../core/dom.ts";
import { t } from "../core/i18n.ts";
import { roleVar } from "./events-table.ts";
import { icons } from "./icons.ts";
import { copyText } from "./toast.ts";

export interface Inspector {
  show(frameId: string): void;
  hide(): void;
  isOpen(): boolean;
  nav(delta: number): void;
  copy(): void;
}

const hex2 = (n: number) => n.toString(16).padStart(2, "0");
const hex8 = (n: number) => (n >>> 0).toString(16).padStart(8, "0");

function fieldRows(fields: FieldNode[], depth: number): SafeHtml {
  return html`${fields.map(
    (
      f,
    ) => html`<div class="ins-field" role="treeitem" aria-level="${depth + 2}" tabindex="-1" data-depth="${depth}" ${f.from !== undefined ? html`data-from="${f.from}" data-to="${f.to ?? f.from + 1}"` : ""}>
      <span class="k">${f.label}</span><span class="v">${f.value}${f.example ? html`<i class="eg" title="${t("ins.egHelp")}">${t("ins.eg")}</i>` : ""}</span>
      ${f.note ? html`<span class="note">${f.note}</span>` : ""}</div>
      ${f.children ? fieldRows(f.children, depth + 1) : ""}`,
  )}`;
}

function layerOf(frame: Frame, i: number): string {
  return frame.layers.find((l) => i >= l.from && i < l.to)?.role ?? "muted";
}

function dataView(frame: Frame): SafeHtml {
  const n = frame.data.length;
  if (frame.unit === "byte") {
    const rows: SafeHtml[] = [];
    for (let off = 0; off < n; off += 16) {
      const slice = frame.data.slice(off, off + 16);
      rows.push(html`<div class="hex-row"><span class="hex-at">${off.toString(16).padStart(4, "0")}</span>
        <span class="hex-bytes">${slice.map(
          (b, k) =>
            html`<span class="hx${b === null ? " unknown" : ""}" data-i="${off + k}" data-v="--c:var(--${roleVar(layerOf(frame, off + k))})">${b === null ? "··" : hex2(b)}</span>`,
        )}</span>
        <span class="hex-ascii">${slice.map((b) => (b === null ? "·" : b >= 32 && b < 127 ? String.fromCharCode(b) : "."))}</span></div>`);
    }
    return html`<div class="micro">${t("ins.bytes", { n })}</div><div class="hex" aria-hidden="true">${rows}</div>`;
  }
  if (frame.unit === "bit") {
    const fields = frame.layers.flatMap((l) =>
      l.fields.filter((f) => f.from !== undefined).map((f) => ({ f, role: l.role })),
    );
    return html`<div class="micro">${t("ins.bits", { n })}</div>
      <div class="bits" data-v="--n:${n}" aria-hidden="true">${frame.data.map((_, i) => html`<span class="bit-idx">${n - 1 - i}</span>`)}</div>
      <div class="bits" data-v="--n:${n}" aria-hidden="true">${frame.data.map(
        (b, i) =>
          html`<span class="bit" data-i="${i}" data-v="--c:var(--${roleVar(layerOf(frame, i))})">${b === null ? "·" : b}</span>`,
      )}</div>
      <div class="bit-fields" data-v="--n:${n}" aria-hidden="true">${fields.map(
        ({ f, role }) =>
          html`<span class="bit-field" data-from="${f.from ?? 0}" data-to="${f.to ?? 0}" data-v="--from:${(f.from ?? 0) + 1};--to:${(f.to ?? 0) + 1};--c:var(--${roleVar(role)})">${f.label}</span>`,
      )}</div>`;
  }
  const base = frame.baseAddress ?? 0;
  return html`<div class="micro">${t("ins.words", { n })}</div><div class="words" aria-hidden="true">${frame.data.map(
    (w, i) =>
      html`<span class="at">0x${hex8(base + i * 4)}</span><span class="w hx" data-i="${i}" data-v="--c:var(--${roleVar(layerOf(frame, i))})">${w === null ? "········" : `0x${hex8(w)}`}</span>`,
  )}</div>`;
}

function frameText(frame: Frame): string {
  if (frame.unit === "byte") return frame.data.map((b) => (b === null ? "??" : hex2(b))).join(" ");
  if (frame.unit === "bit") return frame.data.map((b) => (b === null ? "?" : String(b))).join("");
  return frame.data.map((w) => (w === null ? "????????" : hex8(w))).join("\n");
}

export function createInspector(
  host: HTMLElement,
  frames: Record<string, Frame>,
  order: string[],
  routes: Record<string, string>,
  onClose: () => void,
  onNav: (frameId: string) => void,
): Inspector {
  let current: Frame | null = null;

  host.addEventListener("click", (e) => {
    const el = e.target as Element;
    if (el.closest(".ins-close")) onClose();
    else if (el.closest(".ins-prev")) api.nav(-1);
    else if (el.closest(".ins-next")) api.nav(1);
    else if (el.closest(".ins-copy")) api.copy();
    else {
      const seg = el.closest<HTMLElement>(".ins-seg");
      if (seg)
        host
          .querySelector(`[data-layer="${CSS.escape(seg.dataset.seg ?? "")}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  });
  const setHot = (from: number, to: number, on: boolean) => {
    for (let i = from; i < to; i++)
      for (const el of host.querySelectorAll(`[data-i="${i}"]`)) el.classList.toggle("is-hot", on);
  };
  const clearHot = () => {
    for (const el of host.querySelectorAll(".is-hot")) el.classList.remove("is-hot");
  };
  host.addEventListener("mouseover", (e) => {
    const el = e.target as Element;
    const field = el.closest<HTMLElement>("[data-from]");
    clearHot();
    if (field) {
      setHot(Number(field.dataset.from), Number(field.dataset.to), true);
      field.classList.add("is-hot");
      return;
    }
    const cell = el.closest<HTMLElement>("[data-i]");
    if (cell) {
      const i = Number(cell.dataset.i);
      const candidates = [...host.querySelectorAll<HTMLElement>(".ins-field[data-from]")].filter(
        (f) => i >= Number(f.dataset.from) && i < Number(f.dataset.to),
      );
      const deepest = candidates.sort((a, b) => Number(b.dataset.depth) - Number(a.dataset.depth))[0];
      if (deepest) {
        deepest.classList.add("is-hot");
        setHot(Number(deepest.dataset.from), Number(deepest.dataset.to), true);
      } else cell.classList.add("is-hot");
    }
  });
  host.addEventListener("mouseleave", clearHot);
  host.addEventListener("keydown", (e) => {
    const field = (e.target as Element).closest<HTMLElement>(".ins-field");
    if (!field || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    e.stopPropagation();
    const all = [...host.querySelectorAll<HTMLElement>(".ins-field")];
    const next = all[all.indexOf(field) + (e.key === "ArrowDown" ? 1 : -1)];
    if (next) {
      next.focus();
      clearHot();
      if (next.dataset.from) setHot(Number(next.dataset.from), Number(next.dataset.to), true);
    }
  });

  const api: Inspector = {
    show(frameId) {
      const frame = frames[frameId];
      if (!frame) return;
      current = frame;
      const total = frame.data.length || 1;
      const idx = order.indexOf(frameId);
      render(
        host,
        html`<div class="ins-head">
          <div class="ttl"><span class="micro">${t("ins.title")}${idx >= 0 ? html` · ${t("ins.pos", { n: idx + 1, total: order.length })}` : ""}</span><h2 id="ins-title">${frame.title}</h2><p>${frame.summary}</p></div>
          <button class="icon-btn ins-prev" type="button" aria-label="${t("ins.prev")}" ${idx <= 0 ? html`disabled` : ""}>${icons.prev()}</button>
          <button class="icon-btn ins-next" type="button" aria-label="${t("ins.next")}" ${idx < 0 || idx >= order.length - 1 ? html`disabled` : ""}>${icons.next()}</button>
          <button class="icon-btn ins-close" type="button" aria-label="${t("ins.close")}">${icons.close()}</button>
        </div>
        <div class="ins-scroll">
          ${frame.where || routes[frameId] ? html`<p class="ins-where">${frame.where ?? routes[frameId]}</p>` : ""}
          <div class="ins-bar">${frame.layers.map(
            (l) =>
              html`<button type="button" class="ins-seg" data-seg="${l.id}" title="${l.label}" data-v="--w:${Math.max(1, l.to - l.from)};--c:var(--${roleVar(l.role)})"><b>${l.label}</b><i>${l.to - l.from}</i></button>`,
          )}</div>
          <div class="ins-cols" data-unit="${frame.unit}"><div class="ins-tree" role="tree" aria-labelledby="ins-title">${frame.layers.map(
            (
              l,
            ) => html`<details class="ins-layer" open data-layer="${l.id}" data-v="--c:var(--${roleVar(l.role)})">
              <summary data-from="${l.from}" data-to="${l.to}">${l.label} <span class="micro">${frame.unit === "bit" ? `${l.to - l.from} bits` : `${l.to - l.from} ${frame.unit === "byte" ? "B" : "×32"}`}</span></summary>
              <div class="ins-fields" role="group">${fieldRows(l.fields, 0)}</div></details>`,
          )}</div>
          <div class="ins-data">${dataView(frame)}
          <div class="side-actions"><button class="btn ins-copy" type="button">${icons.copy()} ${t("ins.copyHex")}</button></div></div></div>
        </div>
        <div class="ins-foot"><span><i class="eg">${t("ins.eg")}</i> ${t("ins.egHelp")}</span><span><b class="mono">··</b> ${t("ins.unknown")}</span></div>`,
      );
      void total;
      host.hidden = false;
      host.querySelector<HTMLElement>(".ins-close")?.focus({ preventScroll: true });
    },
    hide() {
      host.hidden = true;
      current = null;
    },
    isOpen: () => !host.hidden,
    nav(delta) {
      if (!current) return;
      const i = order.indexOf(current.id) + delta;
      const id = order[i];
      if (id) onNav(id);
    },
    copy() {
      if (current) void copyText(frameText(current), t("ins.copied"), t("narr.copyFail"));
    },
  };
  return api;
}
