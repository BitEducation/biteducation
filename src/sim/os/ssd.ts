/**
 * Flash translation layer on a tiny SSD: 5 blocks of 4 pages, logical capacity of 12 pages plus
 * reserve. Pages are written out of place; an overwrite only invalidates the old copy. When free
 * blocks drop to the reserve, greedy garbage collection erases the block with most invalid pages,
 * first copying its valid ones. TRIM tells the SSD that deleted pages are invalid.
 */

export const BLOCKS = 5;
export const PAGES = 4;
export const LOGICAL = 12;

export type Slot = { lpn: number; valid: boolean } | null;

export interface SsdOp {
  phase: "escreve" | "reescreve" | "apaga" | "coleta";
  what: string;
  /** Flash contents after the op, indexed [block][page]. */
  flash: Slot[][];
  flashWrites: number;
  hostWrites: number;
  erases: number[];
}

export function ssdRun(rewrites: number, trim: boolean) {
  const r = Math.min(3, Math.max(1, rewrites));
  const flash: Slot[][] = Array.from({ length: BLOCKS }, () => Array<Slot>(PAGES).fill(null));
  const erases = Array<number>(BLOCKS).fill(0);
  const map = new Map<number, [number, number]>();
  const ops: SsdOp[] = [];
  let host = 0;
  let fw = 0;
  let open = 0;
  let next = 0;
  const snap = (phase: SsdOp["phase"], what: string) =>
    ops.push({
      phase,
      what,
      flash: flash.map((b) => b.map((s) => (s ? { ...s } : null))),
      flashWrites: fw,
      hostWrites: host,
      erases: [...erases],
    });
  const place = (lpn: number) => {
    if (next === PAGES) {
      open = flash.findIndex((b) => b.every((s) => s === null));
      next = 0;
    }
    const old = map.get(lpn);
    if (old) {
      const s = flash[old[0]]?.[old[1]];
      if (s) s.valid = false;
    }
    (flash[open] as Slot[])[next] = { lpn, valid: true };
    map.set(lpn, [open, next]);
    next++;
    fw++;
  };

  for (let l = 0; l < LOGICAL; l++) {
    host++;
    place(l);
  }
  snap("escreve", `grava L0 a L${LOGICAL - 1}`);
  const resetHost = { host, fw };

  // The file holding L4..L7 is deleted; only TRIM tells the SSD.
  if (trim)
    for (let l = 4; l < 8; l++) {
      const at = map.get(l);
      const s = at ? flash[at[0]]?.[at[1]] : null;
      if (s) s.valid = false;
      map.delete(l);
    }
  snap("apaga", trim ? "TRIM: L4 a L7 inválidas" : "arquivo apagado; o SSD não sabe");

  for (let l = 0; l < r; l++) {
    host++;
    place(l);
    snap("reescreve", `reescreve L${l}`);
  }

  // Greedy GC among full blocks other than the open one.
  const invalid = (b: Slot[]) => b.filter((s) => s && !s.valid).length;
  let victim = -1;
  let best = -1;
  flash.forEach((b, i) => {
    if (i !== open && b.every((s) => s !== null) && invalid(b) > best) {
      best = invalid(b);
      victim = i;
    }
  });
  const vb = flash[victim] as Slot[];
  const moved = vb.filter((s): s is { lpn: number; valid: boolean } => !!s?.valid).map((s) => s.lpn);
  for (const l of moved) place(l);
  for (let i = 0; i < PAGES; i++) vb[i] = null;
  erases[victim] = (erases[victim] ?? 0) + 1;
  snap("coleta", `apaga o bloco ${victim}`);

  const hostAfter = host - resetHost.host;
  const flashAfter = fw - resetHost.fw;
  return {
    ops,
    victim,
    victimInvalid: best,
    copies: moved.length,
    hostAfter,
    flashAfter,
    /** Write amplification in the rewrite phase, with two decimals. */
    wa: Math.round((flashAfter / hostAfter) * 100) / 100,
  };
}
