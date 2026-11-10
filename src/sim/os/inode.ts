/**
 * Unix-style inode block map: 12 direct pointers, then single, double and triple indirect blocks.
 * Pointers are 4 bytes, so an index block holds blockSize / 4 of them.
 */

export const DIRECT = 12;

export interface FileMap {
  dataBlocks: number;
  direct: number;
  single: number;
  double: number;
  triple: number;
  /** Index blocks needed to reach all data blocks. */
  indexBlocks: number;
}

export const perBlock = (bs: number) => bs / 4;

export function mapFile(size: number, bs: number): FileMap {
  const P = perBlock(bs);
  let left = Math.ceil(size / bs);
  const dataBlocks = left;
  const direct = Math.min(left, DIRECT);
  left -= direct;
  const single = Math.min(left, P);
  left -= single;
  const double = Math.min(left, P * P);
  left -= double;
  const triple = Math.min(left, P * P * P);
  const indexBlocks =
    (single > 0 ? 1 : 0) +
    (double > 0 ? 1 + Math.ceil(double / P) : 0) +
    (triple > 0 ? 1 + Math.ceil(triple / (P * P)) + Math.ceil(triple / P) : 0);
  return { dataBlocks, direct, single, double, triple, indexBlocks };
}

export type Level = "direto" | "indireto simples" | "indireto duplo" | "indireto triplo";

/** Where the byte at `offset` lives: logical block, level and the index used at each level. */
export function locate(
  offset: number,
  bs: number,
): { block: number; level: Level; path: number[]; reads: number } {
  const P = perBlock(bs);
  const block = Math.floor(offset / bs);
  let i = block;
  if (i < DIRECT) return { block, level: "direto", path: [i], reads: 1 };
  i -= DIRECT;
  if (i < P) return { block, level: "indireto simples", path: [DIRECT, i], reads: 2 };
  i -= P;
  if (i < P * P)
    return { block, level: "indireto duplo", path: [DIRECT + 1, Math.floor(i / P), i % P], reads: 3 };
  i -= P * P;
  return {
    block,
    level: "indireto triplo",
    path: [DIRECT + 2, Math.floor(i / (P * P)), Math.floor(i / P) % P, i % P],
    reads: 4,
  };
}

export const maxBlocks = (bs: number) => {
  const P = perBlock(bs);
  return DIRECT + P + P * P + P * P * P;
};
