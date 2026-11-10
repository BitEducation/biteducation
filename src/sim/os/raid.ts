/**
 * Block layouts of RAID 0, RAID 1+0 and RAID 5 (left-symmetric: parity moves one disk to the left on
 * every stripe), XOR parity, reconstruction after a failure and the I/O cost of a small write.
 */
export type Level = "0" | "10" | "5";

export interface Cell {
  /** Data block number, or -1 for parity and -2 for an unused slot. */
  block: number;
  value: number;
}

/** A deterministic, varied byte for each data block. */
export const blockValue = (block: number) => (block * 37 + 0x5a) & 0xff;

export const parityDisk = (stripe: number, disks: number) => disks - 1 - (stripe % disks);

/** layout[stripe][disk]. */
export function layout(level: Level, disks: number, stripes: number): Cell[][] {
  const rows: Cell[][] = [];
  for (let s = 0; s < stripes; s++) {
    const row: Cell[] = [];
    if (level === "0") {
      for (let d = 0; d < disks; d++) {
        const block = s * disks + d;
        row.push({ block, value: blockValue(block) });
      }
    } else if (level === "10") {
      const pairs = Math.floor(disks / 2);
      for (let d = 0; d < disks; d++) {
        const pair = Math.floor(d / 2);
        if (pair >= pairs) row.push({ block: -2, value: 0 });
        else {
          const block = s * pairs + pair;
          row.push({ block, value: blockValue(block) });
        }
      }
    } else {
      const p = parityDisk(s, disks);
      const cells: Cell[] = Array.from({ length: disks }, () => ({ block: -1, value: 0 }));
      let parity = 0;
      for (let k = 0; k < disks - 1; k++) {
        const d = (p + 1 + k) % disks;
        const block = s * (disks - 1) + k;
        const value = blockValue(block);
        parity ^= value;
        cells[d] = { block, value };
      }
      cells[p] = { block: -1, value: parity };
      row.push(...cells);
    }
    rows.push(row);
  }
  return rows;
}

export const xor = (xs: number[]) => xs.reduce((a, b) => a ^ b, 0);

/** Rebuilds what disk `failed` held in a RAID 5 stripe from the surviving disks. */
export function rebuild(stripe: Cell[], failed: number): number {
  return xor(stripe.filter((_, d) => d !== failed).map((c) => c.value));
}

export function capacity(level: Level, disks: number): number {
  if (level === "0") return disks;
  if (level === "10") return Math.floor(disks / 2);
  return disks - 1;
}

/** Failures survived in the worst case. */
export const tolerated = (level: Level) => (level === "0" ? 0 : 1);

/** Disk accesses to overwrite one block: RAID 5 must read old data and parity first. */
export const smallWriteIos = (level: Level) => (level === "0" ? 1 : level === "10" ? 2 : 4);

/** Where a RAID 5 data block lives. */
export function locate5(block: number, disks: number): { stripe: number; disk: number; parity: number } {
  const stripe = Math.floor(block / (disks - 1));
  const parity = parityDisk(stripe, disks);
  return { stripe, disk: (parity + 1 + (block % (disks - 1))) % disks, parity };
}
