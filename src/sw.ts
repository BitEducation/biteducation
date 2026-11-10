/**
 * Hand-written service worker. scripts/build-sw.ts prepends the constants below
 * and writes dist/sw.js. Strategy:
 *   - install: precache the shells (hub, sites, about, 404) and every hashed asset except the
 *     lesson chunks;
 *   - hashed assets: cache first (their names change when their content changes);
 *   - pages and JSON: network first, falling back to the cache, keyed without the query string,
 *     so ?passo= and ?lab= never become separate entries;
 *   - lesson chunks and pages: cached at runtime and by the "download this site" button, which
 *     writes into RUNTIME from the page.
 * No skipWaiting on install: the page asks for it after the reader clicks "Reload".
 */
declare const VERSION: string;
declare const BASE: string;
declare const PRECACHE: readonly string[];
declare const ASSETS: readonly string[];

const sw = self as unknown as ServiceWorkerGlobalScope;
const PRE = `pd-pre-${VERSION}`;
const RUNTIME = "pd-runtime";
const assetSet = new Set(ASSETS.map((p) => new URL(p, sw.location.origin).pathname));

sw.addEventListener("install", (e) => {
  e.waitUntil(caches.open(PRE).then((c) => c.addAll(PRECACHE)));
});

sw.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith("pd-pre-") && name !== PRE) await caches.delete(name);
      // Drop lesson chunks of older builds; pages stay (they are refreshed on the next visit).
      const rt = await caches.open(RUNTIME);
      for (const req of await rt.keys()) {
        const path = new URL(req.url).pathname;
        if (path.startsWith(`${BASE}assets/`) && !assetSet.has(path)) await rt.delete(req);
      }
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("message", (e) => {
  if ((e.data as { type?: string } | null)?.type === "skip-waiting") void sw.skipWaiting();
});

/** Cache key without query or hash: one entry per page. */
function keyOf(url: URL): string {
  return `${url.origin}${url.pathname}`;
}

async function cacheFirst(req: Request, key: string): Promise<Response> {
  const hit = await caches.match(key);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && !res.redirected) await (await caches.open(RUNTIME)).put(key, res.clone());
  return res;
}

async function networkFirst(req: Request, key: string): Promise<Response> {
  try {
    const res = await fetch(req);
    // Redirected responses cannot answer a navigation later, so they are not stored.
    if (res.ok && !res.redirected) await (await caches.open(RUNTIME)).put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await caches.match(key);
    if (hit) return hit;
    if (req.mode === "navigate") {
      const fallback = await caches.match(`${sw.location.origin}${BASE}404.html`);
      if (fallback) return fallback;
    }
    throw err;
  }
}

sw.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin || !url.pathname.startsWith(BASE)) return;
  const key = keyOf(url);
  if (url.pathname.startsWith(`${BASE}assets/`)) e.respondWith(cacheFirst(req, key));
  else e.respondWith(networkFirst(req, key));
});
