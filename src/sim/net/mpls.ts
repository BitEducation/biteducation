/**
 * MPLS on a small provider network: the ingress router classifies once and pushes a label, each
 * core router swaps it by exact match, the egress pops it. Traffic engineering then moves a flow
 * off the shortest path when that path would overflow. Labels and capacities are illustrative.
 */

export const CAPACITY = 1000;
export const WEB = 600;
export const SHORT = ["PE1", "P3", "PE2"];
export const LONG = ["PE1", "P1", "P2", "PE2"];

/** Label switched path over LONG: what each router does with the label. */
export const LSP = [
  { router: "PE1", inLabel: "— (IP)", outLabel: "100", next: "P1", op: "empilha" },
  { router: "P1", inLabel: "100", outLabel: "200", next: "P2", op: "troca" },
  { router: "P2", inLabel: "200", outLabel: "300", next: "PE2", op: "troca" },
  { router: "PE2", inLabel: "300", outLabel: "— (IP)", next: "B", op: "desempilha" },
] as const;

/** 32-bit MPLS shim header: label 20, traffic class 3, bottom of stack 1, TTL 8. */
export const SHIM = [
  { field: "Rótulo", bits: 20 },
  { field: "TC", bits: 3 },
  { field: "S", bits: 1 },
  { field: "TTL", bits: 8 },
];

export function teRun(video: number) {
  // Plain IP routing: both flows follow the shortest path.
  const ipShort = WEB + video;
  const ipLong = 0;
  // With TE, the video gets its own LSP over the longer path.
  const teShort = WEB;
  const teLong = video;
  return {
    ip: { short: ipShort, long: ipLong, over: ipShort > CAPACITY },
    te: { short: teShort, long: teLong, over: teShort > CAPACITY || teLong > CAPACITY },
  };
}
