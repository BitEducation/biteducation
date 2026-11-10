/**
 * How multi-byte values sit in byte-addressed memory: byte order, network order, aligned and
 * misaligned accesses, and the padding a compiler inserts so every field is naturally aligned.
 */
export type Endian = "little" | "big";

/** Bytes of `value` in memory order (lowest address first). */
export function toBytes(value: number, size: number, endian: Endian): number[] {
  const msbFirst = Array.from({ length: size }, (_, i) => Math.floor(value / 256 ** (size - 1 - i)) % 256);
  return endian === "big" ? msbFirst : msbFirst.reverse();
}

export function fromBytes(bytes: readonly number[], endian: Endian): number {
  const msbFirst = endian === "big" ? bytes : [...bytes].reverse();
  return msbFirst.reduce((acc, b) => acc * 256 + b, 0);
}

/** Bus words of `word` bytes touched by an access of `size` bytes at `addr`. */
export function wordsTouched(addr: number, size: number, word = 4): number {
  return Math.floor((addr + size - 1) / word) - Math.floor(addr / word) + 1;
}

export interface Field {
  name: string;
  type: string;
  size: number;
}

export interface Placed extends Field {
  offset: number;
  padBefore: number;
}

/** C-like layout: each field at the next multiple of its size; the total rounds up to the largest. */
export function layout(fields: readonly Field[]): { placed: Placed[]; size: number; padding: number } {
  let at = 0;
  const placed = fields.map((f) => {
    const offset = Math.ceil(at / f.size) * f.size;
    const p = { ...f, offset, padBefore: offset - at };
    at = offset + f.size;
    return p;
  });
  const align = Math.max(1, ...fields.map((f) => f.size));
  const size = Math.ceil(at / align) * align;
  const data = fields.reduce((s, f) => s + f.size, 0);
  return { placed, size, padding: size - data };
}

/** Largest fields first: a simple order that never needs inner padding for power-of-two sizes. */
export const bySize = (fields: readonly Field[]) => [...fields].sort((a, b) => b.size - a.size);
