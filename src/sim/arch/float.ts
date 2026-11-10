/** IEEE 754 single precision: encode a number into its 32 bits and split the three fields. */
import { bitsOf, unsigned } from "./ints.ts";

export const BIAS = 127;

/** The 32 bits of `x` rounded to float32, sign bit first. */
export function f32Bits(x: number): number[] {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, x);
  return bitsOf(view.getUint32(0), 32);
}

export function fromBits(bits: readonly number[]): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, unsigned(bits));
  return view.getFloat32(0);
}

export type FloatClass = "zero" | "subnormal" | "normal" | "infinity" | "nan";

export interface Fields {
  sign: number;
  /** Raw stored exponent, 0..255. */
  stored: number;
  /** Real exponent (stored − bias, or 1 − bias for subnormals). */
  exp: number;
  fraction: number[];
  cls: FloatClass;
}

export function fields(bits: readonly number[]): Fields {
  const sign = bits[0] ?? 0;
  const stored = unsigned(bits.slice(1, 9));
  const fraction = bits.slice(9);
  const anyFrac = fraction.some((b) => b === 1);
  const cls: FloatClass =
    stored === 255
      ? anyFrac
        ? "nan"
        : "infinity"
      : stored === 0
        ? anyFrac
          ? "subnormal"
          : "zero"
        : "normal";
  return { sign, stored, exp: stored === 0 ? 1 - BIAS : stored - BIAS, fraction, cls };
}

/**
 * Binary scientific notation of a finite non-zero number: integer and fractional digits of |x|
 * (fractional digits capped), plus the exponent that normalizes it to 1.xxx.
 */
export function binaryDigits(x: number, maxFrac = 64): { int: string; frac: string; exp: number } {
  const ax = Math.abs(x);
  let ip = Math.floor(ax);
  let fp = ax - ip;
  const int = ip === 0 ? "0" : ip.toString(2);
  let frac = "";
  while (fp > 0 && frac.length < maxFrac) {
    fp *= 2;
    const d = Math.floor(fp);
    frac += String(d);
    fp -= d;
  }
  ip = Math.floor(ax);
  const exp = ip >= 1 ? int.length - 1 : -(frac.indexOf("1") + 1);
  return { int, frac, exp };
}

/** Distance from |x| (as float32) to the next larger float32: one unit in the last place. */
export function ulp(x: number): number {
  const bits = f32Bits(Math.abs(x));
  const view = new DataView(new ArrayBuffer(4));
  view.setUint32(0, unsigned(bits) + 1);
  return view.getFloat32(0) - Math.fround(Math.abs(x));
}
