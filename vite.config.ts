import { resolve } from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const SITES = ["redes", "so", "arq"] as const;
const LESSON_ROUTE = new RegExp(`^/(${SITES.join("|")})/(?!assets/)[a-z0-9-]+/?(\\?.*)?$`);

/**
 * In production every lesson has its own prerendered index.html (GitHub Pages has no rewrites).
 * In dev we emulate that by serving the site shell for /<site>/<slug>/ URLs.
 */
function devLessonRoutes(): Plugin {
  return {
    name: "biteducation:dev-lesson-routes",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? "/";
        const match = LESSON_ROUTE.exec(url);
        if (match) req.url = `/${match[1]}/index.html${match[2] ?? ""}`;
        else if (url === "/sobre" || url.startsWith("/sobre/?")) req.url = "/sobre/index.html";
        next();
      });
    },
  };
}

export default defineConfig({
  base: process.env.BASE_URL ?? "/",
  plugins: [devLessonRoutes()],
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        hub: resolve(import.meta.dirname, "index.html"),
        redes: resolve(import.meta.dirname, "redes/index.html"),
        so: resolve(import.meta.dirname, "so/index.html"),
        arq: resolve(import.meta.dirname, "arq/index.html"),
        sobre: resolve(import.meta.dirname, "sobre/index.html"),
        notFound: resolve(import.meta.dirname, "404.html"),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
    coverage: { provider: "v8", include: ["src/sim/**", "src/core/**"] },
  },
});
