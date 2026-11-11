import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LessonModule, Params, SceneSpec } from "../contracts/types.ts";
import { nodeSize } from "../scene/geometry.ts";
import { isDevice, pictogram } from "../scene/pictograms.ts";

/**
 * Node boxes grow with their labels (nodeSize), so a scene laid out by hand can end up with
 * boxes drawn over each other. The canvas scales down on small screens, which makes any
 * overlap worse to read: every scene must keep its boxes apart.
 */
const LESSONS = ["redes", "so", "arq"].flatMap((site) =>
  readdirSync(join(import.meta.dirname, site, "lessons"))
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => `${site}/${f.slice(0, -3)}`),
);

/** Lab inputs that make a scene widest, for lessons whose layout depends on them. */
const EXTRA: Record<string, Params[]> = {
  "so/escalonamento": [{ processos: "0:9:3 1:2:2 2:6:1 4:3:0 5:4:4 6:2:5" }],
  "so/round-robin": [{ processos: "0:5 1:9 2:2 3:4 12:12 30:12" }],
};

function overlaps(spec: SceneSpec): string[] {
  const boxes = spec.nodes.map((n) => {
    const [w, h] = nodeSize(n, pictogram(n.kind) !== "");
    // Equipment has no drawn box; its label still starts after the pictogram.
    return {
      id: n.id,
      x: n.at[0] - w / 2,
      y: n.at[1] - h / 2,
      w,
      h,
      device: isDevice(n.kind),
      hidden: n.hidden === true,
    };
  });
  const out: string[] = [];
  boxes.forEach((a, i) => {
    for (const b of boxes.slice(i + 1)) {
      // One shown and one hidden at the start is a swap in place (proxies: origin → backends).
      if (a.hidden !== b.hidden) continue;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      // Two pieces of equipment may touch by a few pixels: neither draws a frame.
      const slack = a.device && b.device ? 4 : 0;
      if (ox > slack && oy > slack) out.push(`${a.id} × ${b.id} (${Math.round(ox)}px)`);
    }
  });
  return out;
}

describe("cenas sem caixas sobrepostas", () => {
  it.each(LESSONS)("%s", async (path) => {
    const lesson = (await import(`./${path.replace("/", "/lessons/")}.ts`)).default as LessonModule;
    for (const extra of [{}, ...(EXTRA[path] ?? [])]) {
      const params = { ...lesson.params.defaults, ...extra } as Params;
      const spec = typeof lesson.scene === "function" ? lesson.scene(params) : lesson.scene;
      expect(overlaps(spec), JSON.stringify(extra)).toEqual([]);
    }
  });
});
