import { html, render } from "../core/dom.ts";

let host: HTMLElement | null = null;

export function toast(message: string, ms = 2600): void {
  if (!host) {
    host = document.createElement("div");
    host.className = "toasts";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.append(host);
  }
  const el = document.createElement("div");
  el.className = "toast";
  render(el, html`${message}`);
  host.append(el);
  setTimeout(() => el.remove(), ms);
}

export async function copyText(text: string, ok: string, fail: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    toast(fail);
  }
}
