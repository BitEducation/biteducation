/**
 * Serves dist/ the way GitHub Pages does: "dir/" → dir/index.html, "dir" → redirect to "dir/",
 * anything missing → 404.html with status 404. Used by the E2E tests (vite preview falls back
 * to the SPA index instead). Listens on 127.0.0.1 only.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const DIST = resolve(import.meta.dirname, "..", "dist");
const PORT = Number(process.env.PORT ?? 4173);
const BASE = process.env.BASE_URL ?? "/";
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    path = "/";
  }
  const send = (file: string, status = 200) => {
    res.writeHead(status, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  };
  const notFound = () => send(join(DIST, "404.html"), 404);
  if (!path.startsWith(BASE)) return notFound();
  const file = normalize(join(DIST, path.slice(BASE.length)));
  if (file !== DIST && !file.startsWith(DIST + sep)) return notFound();
  if (!existsSync(file)) return notFound();
  if (statSync(file).isDirectory()) {
    if (!path.endsWith("/")) {
      res.writeHead(301, { location: `${path}/${url.search}` });
      return res.end();
    }
    const index = join(file, "index.html");
    return existsSync(index) ? send(index) : notFound();
  }
  send(file);
}).listen(PORT, "127.0.0.1", () => console.log(`dist em http://127.0.0.1:${PORT}${BASE}`));
