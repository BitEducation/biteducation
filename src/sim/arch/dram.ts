/**
 * A DRAM with banks, each keeping one open row in its row buffer. Reading a column of the open row
 * costs tCL; a closed bank first activates the row (tRCD); a bank with another row open first
 * precharges it (tRP). Accesses are served one after another, without overlapping commands.
 */
export interface Timing {
  cl: number;
  rcd: number;
  rp: number;
}
export interface Access {
  bank: number;
  row: number;
  col: number;
}
export type AccessKind = "acerto" | "fechada" | "conflito";
export interface Served extends Access {
  kind: AccessKind;
  from: number;
  to: number;
}

export function serve(accesses: Access[], t: Timing) {
  const open = new Map<number, number>();
  let now = 0;
  const out: Served[] = accesses.map((a) => {
    const cur = open.get(a.bank);
    const kind: AccessKind = cur === a.row ? "acerto" : cur === undefined ? "fechada" : "conflito";
    const cost = kind === "acerto" ? t.cl : kind === "fechada" ? t.rcd + t.cl : t.rp + t.rcd + t.cl;
    open.set(a.bank, a.row);
    const s = { ...a, kind, from: now, to: now + cost };
    now += cost;
    return s;
  });
  const count = (k: AccessKind) => out.filter((x) => x.kind === k).length;
  return {
    served: out,
    end: now,
    hits: count("acerto"),
    conflicts: count("conflito"),
    closed: count("fechada"),
  };
}

/** Eight reads in one row; then a[i], b[i] alternating, with b in the same bank or in another. */
export function patterns(n = 8) {
  const seq: Access[] = Array.from({ length: n }, (_, i) => ({ bank: 0, row: 5, col: i }));
  const alt = (bankB: number): Access[] =>
    Array.from({ length: n }, (_, i) =>
      i % 2 === 0 ? { bank: 0, row: 5, col: i / 2 } : { bank: bankB, row: 9, col: (i - 1) / 2 },
    );
  return { seq, same: alt(0), spread: alt(1) };
}
