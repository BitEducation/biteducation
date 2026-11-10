/**
 * Pure segmentation: each segment has a base and a limit; a logical address (segment, offset)
 * is checked against the limit and the permissions, then added to the base. Physical memory is
 * tracked in 1 KiB cells to show holes and compaction.
 */
export const KIB = 1024;

export interface Segment {
  name: string;
  base: number;
  limit: number;
  perm: "r-x" | "rw-";
}

export type Access = "leitura" | "escrita" | "execução";

export type Translation =
  | { ok: true; physical: number }
  | { ok: false; reason: "limite" | "proteção" | "segmento" };

const allowed = (perm: Segment["perm"], a: Access) =>
  a === "leitura" ? perm[0] === "r" : a === "escrita" ? perm[1] === "w" : perm[2] === "x";

export function translate(
  table: Segment[],
  seg: number,
  offset: number,
  access: Access = "leitura",
): Translation {
  const s = table[seg];
  if (!s) return { ok: false, reason: "segmento" };
  if (offset < 0 || offset >= s.limit) return { ok: false, reason: "limite" };
  if (!allowed(s.perm, access)) return { ok: false, reason: "proteção" };
  return { ok: true, physical: s.base + offset };
}

/** Owner of each 1 KiB cell ("" when free). */
export type MemMap = string[];

export function place(map: MemMap, owner: string, base: number, size: number): MemMap {
  const out = [...map];
  for (let i = base / KIB; i < (base + size) / KIB; i++) out[i] = owner;
  return out;
}

export function holes(map: MemMap) {
  const out: { at: number; size: number }[] = [];
  map.forEach((o, i) => {
    const last = out[out.length - 1];
    if (o) return;
    if (last && last.at + last.size === i * KIB) last.size += KIB;
    else out.push({ at: i * KIB, size: KIB });
  });
  return out;
}

/** First hole big enough, or null: external fragmentation when the free total would fit. */
export const firstFit = (map: MemMap, size: number) => holes(map).find((h) => h.size >= size)?.at ?? null;

export const freeTotal = (map: MemMap) => holes(map).reduce((s, h) => s + h.size, 0);
export const largest = (map: MemMap) => Math.max(0, ...holes(map).map((h) => h.size));

/**
 * Slides every block down in order, keeping block order. Returns the new map, the new base of each
 * owner and how many bytes had to be copied.
 */
export function compact(map: MemMap, pinned: Set<string>) {
  const out: MemMap = map.map((o) => (pinned.has(o) ? o : ""));
  const bases: Record<string, number> = {};
  let copied = 0;
  let cursor = 0;
  const blocks: { owner: string; at: number; cells: number }[] = [];
  map.forEach((o, i) => {
    const last = blocks[blocks.length - 1];
    if (!o) return;
    if (last && last.owner === o && last.at + last.cells === i) last.cells += 1;
    else blocks.push({ owner: o, at: i, cells: 1 });
  });
  for (const bl of blocks) {
    if (pinned.has(bl.owner)) {
      cursor = Math.max(cursor, bl.at + bl.cells);
      continue;
    }
    while (out.slice(cursor, cursor + bl.cells).some((o) => o)) cursor++;
    for (let k = 0; k < bl.cells; k++) out[cursor + k] = bl.owner;
    bases[bl.owner] = cursor * KIB;
    if (cursor !== bl.at) copied += bl.cells * KIB;
    cursor += bl.cells;
  }
  return { map: out, bases, copied };
}
