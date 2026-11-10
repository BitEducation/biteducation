/**
 * Memory organization (SCO 3.3.5–3.3.6): a memory of `totalBytes` on a `busBits` data bus,
 * built from chips of `chipBits` organized depth × width. Chips side by side fill the bus
 * width (a rank); ranks stacked fill the capacity; the address splits into rank, row, column.
 */

export interface Org {
  depth: number;
  width: number;
}

export interface Layout {
  chips: number;
  perRank: number;
  ranks: number;
  rankBits: number;
  /** Address bits inside one chip (log2 depth). */
  chipAddrBits: number;
  rowBits: number;
  colBits: number;
  /** Address pins with row/column multiplexing (RAS/CAS). */
  pins: number;
  byteBits: number;
}

const log2 = (x: number) => Math.round(Math.log2(x));

export function layout(totalBytes: number, busBits: number, chipBits: number, org: Org): Layout {
  if (org.depth * org.width !== chipBits) throw new Error("memorg: profundidade × largura ≠ bits do chip");
  const perRank = busBits / org.width;
  const rankBytes = (org.depth * busBits) / 8;
  const ranks = totalBytes / rankBytes;
  const chipAddrBits = log2(org.depth);
  const rowBits = Math.ceil(chipAddrBits / 2);
  return {
    chips: perRank * ranks,
    perRank,
    ranks,
    rankBits: log2(ranks),
    chipAddrBits,
    rowBits,
    colBits: chipAddrBits - rowBits,
    pins: rowBits,
    byteBits: log2(busBits / 8),
  };
}

/** Splits a byte address: high bits pick the rank, then row, then column, low bits the byte. */
export function split(addr: number, l: Layout) {
  const byte = addr & ((1 << l.byteBits) - 1);
  const word = addr >>> l.byteBits;
  const col = word & ((1 << l.colBits) - 1);
  const row = (word >>> l.colBits) & ((1 << l.rowBits) - 1);
  const rank = word >>> (l.colBits + l.rowBits);
  return { rank, row, col, byte };
}
