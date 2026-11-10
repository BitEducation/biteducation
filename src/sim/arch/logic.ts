/** Gate-level adders: a full adder with every internal signal and a ripple-carry chain with delays. */

export type Bit = 0 | 1;

export interface FullAdder {
  a: Bit;
  b: Bit;
  cin: Bit;
  /** a XOR b */
  x1: Bit;
  /** a AND b */
  n1: Bit;
  /** x1 XOR cin = sum */
  s: Bit;
  /** x1 AND cin */
  n2: Bit;
  /** n1 OR n2 = carry out */
  cout: Bit;
}

const bit = (v: boolean | number): Bit => (v ? 1 : 0);

export function fullAdder(a: Bit, b: Bit, cin: Bit): FullAdder {
  const x1 = bit(a ^ b);
  const n1 = bit(a & b);
  const s = bit(x1 ^ cin);
  const n2 = bit(x1 & cin);
  return { a, b, cin, x1, n1, s, n2, cout: bit(n1 | n2) };
}

export interface Ripple {
  /** Columns from bit 0 (least significant) upwards. */
  cols: FullAdder[];
  sum: Bit[];
  carryOut: Bit;
  /** Gate delays until each sum bit and each carry settle (inputs at time 0). */
  sumAt: number[];
  carryAt: number[];
  /** Time when every output is stable. */
  settle: number;
}

/** n-bit ripple-carry adder; a and b are unsigned, bit 0 first in the result arrays. */
export function ripple(a: number, b: number, n: number, cin: Bit = 0): Ripple {
  const cols: FullAdder[] = [];
  const sumAt: number[] = [];
  const carryAt: number[] = [];
  let c: Bit = cin;
  let tc = 0;
  for (let i = 0; i < n; i++) {
    const fa = fullAdder(bit((a >> i) & 1), bit((b >> i) & 1), c);
    cols.push(fa);
    // x1 and n1 settle after one gate; s and n2 wait for x1 and the carry; cout waits for n2
    const tx = 1;
    sumAt.push(Math.max(tx, tc) + 1);
    const tn2 = Math.max(tx, tc) + 1;
    tc = Math.max(1, tn2) + 1;
    carryAt.push(tc);
    c = fa.cout;
  }
  return {
    cols,
    sum: cols.map((x) => x.s),
    carryOut: c,
    sumAt,
    carryAt,
    settle: Math.max(...sumAt, ...carryAt),
  };
}
