/**
 * Layer rules:
 *   sites/* → ui, scene, core, sim, contracts, the same site
 *   ui → scene, core, contracts     scene → core, contracts     core → contracts
 *   sim/* → contracts, sim/shared, the same sim folder      contracts → nothing
 * Exceptions: sites/hub and sites/shared may import the three catalogs (they list lessons of
 * every site), and every site may import sites/shared (cross-site links and trails).
 * Runtime code has no bare imports; tests may also use vitest, fast-check and node:*.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : [],
  );
}

/** "sites/so", "sim/os", "ui", ... */
function layerOf(rel: string): string {
  const [a, b] = rel.split("/");
  return a === "sites" || a === "sim" ? `${a}/${b}` : (a ?? "");
}

const ALLOWED: Record<string, (to: string, from: string) => boolean> = {
  contracts: () => false,
  core: (to) => to === "contracts",
  scene: (to) => to === "core" || to === "contracts",
  ui: (to) => ["scene", "core", "contracts"].includes(to),
  sim: (to, from) => to === "contracts" || to === "sim/shared" || to === from,
  sites: (to, from) =>
    to === from || ["ui", "scene", "core", "contracts"].includes(to) || to.startsWith("sim/"),
};

const HUB_EXCEPTION = /^sites\/(redes|so|arq)\/catalog\.ts$/;
const TEST_BARE = /^(vitest|fast-check|node:.+)$/;
const errors: string[] = [];

for (const file of files(SRC)) {
  const rel = relative(SRC, file).replaceAll("\\", "/");
  const isTest = rel.endsWith(".test.ts");
  const from = layerOf(rel);
  const kind = from.split("/")[0] ?? "";
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(/(?:from\s+|import\s*\()\s*["']([^"']+)["']/g)) {
    const spec = m[1] as string;
    const line = text.slice(0, m.index).split("\n").length;
    const where = `src/${rel}:${line}`;
    if (!spec.startsWith(".")) {
      if (!(isTest && TEST_BARE.test(spec)) && spec !== "vite/client")
        errors.push(`${where} importa o pacote "${spec}" (código de produção não tem dependências)`);
      continue;
    }
    const target = relative(SRC, resolve(dirname(file), spec)).replaceAll("\\", "/");
    if (target.startsWith("..")) {
      if (!(isTest && target.startsWith("../tests/"))) errors.push(`${where} importa fora de src: ${spec}`);
      continue;
    }
    const to = layerOf(target);
    if (to === from) continue;
    if ((from === "sites/hub" || from === "sites/shared") && HUB_EXCEPTION.test(target)) continue;
    if (from.startsWith("sites/") && to === "sites/shared") continue;
    const rule = ALLOWED[kind];
    if (!rule) errors.push(`${where} está numa pasta sem regra (${from})`);
    else if (!rule(to, from)) errors.push(`${where}: ${from} não pode importar ${to} (${spec})`);
  }
}

if (errors.length) {
  console.error(`check-imports: ${errors.length} violação(ões)\n${errors.join("\n")}`);
  process.exit(1);
}
console.log("check-imports: ok");
