import { html, render } from "../core/dom.ts";
import { t } from "../core/i18n.ts";
import type { AnySite } from "./topbar.ts";

/** Same name the service worker uses for runtime entries (src/sw.ts). */
const RUNTIME = "pd-runtime";
let reloadRequested = false;
const base = () => import.meta.env?.BASE_URL ?? "/";

export const offlineSupported = (): boolean =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof caches !== "undefined";

/** Registers dist/sw.js in production and offers a reload when a new version is waiting. */
export function registerServiceWorker(): void {
  if (!import.meta.env?.PROD || !offlineSupported()) return;
  const sw = navigator.serviceWorker;
  // clients.claim() also fires controllerchange on the first install; reload only on request.
  sw.addEventListener("controllerchange", () => {
    if (reloadRequested) location.reload();
  });
  void sw
    .register(`${base()}sw.js`, { scope: base() })
    .then((reg) => {
      const offer = (w: ServiceWorker | null) => {
        // Only an update: on the first install there is no controller and nothing to reload.
        if (w && sw.controller) showUpdate(w);
      };
      offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed") offer(w);
        });
      });
    })
    .catch(() => undefined);
}

function showUpdate(worker: ServiceWorker): void {
  if (document.querySelector(".update-bar")) return;
  const bar = document.createElement("div");
  bar.className = "update-bar";
  bar.setAttribute("role", "status");
  render(
    bar,
    html`<span>${t("update.ready")}</span> <button class="btn primary" type="button">${t("update.reload")}</button>`,
  );
  bar.querySelector("button")?.addEventListener("click", () => {
    reloadRequested = true;
    worker.postMessage({ type: "skip-waiting" });
  });
  document.body.append(bar);
}

/**
 * Stores every page and lesson chunk of a site for offline use. The list comes from
 * <site>/offline.json, written at build time; only same-origin paths under the base are kept.
 */
export async function downloadSite(site: AnySite): Promise<boolean> {
  const res = await fetch(`${base()}${site}/offline.json`, { cache: "no-cache" });
  if (!res.ok) return false;
  const list: unknown = await res.json();
  if (!Array.isArray(list)) return false;
  const urls = list.filter(
    (u): u is string =>
      typeof u === "string" && u.startsWith(base()) && !u.includes("//") && !u.includes(".."),
  );
  const cache = await caches.open(RUNTIME);
  await cache.addAll(urls);
  return true;
}
