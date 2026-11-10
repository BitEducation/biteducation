/**
 * Address decoding (SCO 3.7.2): an EPROM, a RAM and a parallel I/O chip on a 16-bit address bus.
 * Full decoding compares every address bit above the chip's own; partial decoding looks at the
 * fewest high bits that still tell the three apart, so each chip answers at many aliases.
 */

export interface Device {
  id: string;
  name: string;
  base: number;
  size: number;
}

export const DEVICES: Device[] = [
  { id: "eprom", name: "EPROM", base: 0x0000, size: 2048 },
  { id: "ram", name: "RAM", base: 0x8000, size: 2048 },
  { id: "pio", name: "E/S paralela", base: 0xfffc, size: 4 },
];

/** Partial decoding by A15 and A14 only. */
const PARTIAL: Record<string, (a: number) => boolean> = {
  eprom: (a) => (a & 0x8000) === 0,
  ram: (a) => (a & 0xc000) === 0x8000,
  pio: (a) => (a & 0xc000) === 0xc000,
};

export function full(addr: number): Device | null {
  return DEVICES.find((d) => addr >= d.base && addr < d.base + d.size) ?? null;
}

export function partial(addr: number): Device | null {
  return DEVICES.find((d) => (PARTIAL[d.id] as (a: number) => boolean)(addr)) ?? null;
}

/** Offset inside the chip: the chip only sees its own low address bits. */
export const offset = (d: Device, addr: number) => addr & (d.size - 1);

/** How many times a chip shows up in the 64 KiB space under partial decoding. */
export function aliases(d: Device): number {
  let n = 0;
  for (let a = 0; a < 0x10000; a++) if (partial(a) === d) n++;
  return n / d.size;
}

/** Address bits compared by each chip-select: full decoding vs partial. */
export function comparedBits(d: Device) {
  const own = Math.log2(d.size);
  return { full: 16 - own, partial: d.id === "eprom" ? 1 : 2 };
}
