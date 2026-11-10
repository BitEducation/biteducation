/**
 * Memory-mapped file: a 4-page file, process A maps it and touches the first pages, process B
 * maps the same file later. Faults that go to disk are major; faults on a page already in the
 * page cache only fill a page-table entry (minor). A write is either shared with the file or,
 * with MAP_PRIVATE, triggers a copy-on-write into a private frame.
 */

export type Share = "shared" | "private";
export const FILE_PAGES = 4;
export const PAGE_KIB = 4;

export interface MmapAccess {
  who: "A" | "B";
  page: number;
  op: "lê" | "escreve";
  kind: "maior" | "menor" | "acerto" | "cow" | "compartilhada";
  frame: number;
}

export function mmapRun(touched: number, mode: Share) {
  const n = Math.min(FILE_PAGES, Math.max(1, touched));
  const acc: MmapAccess[] = [];
  // Page cache frames: file page i lands in frame i on its first read.
  for (let p = 0; p < n; p++) acc.push({ who: "A", page: p, op: "lê", kind: "maior", frame: p });
  acc.push({ who: "A", page: 0, op: "lê", kind: "acerto", frame: 0 });
  acc.push({ who: "B", page: 0, op: "lê", kind: "menor", frame: 0 });
  const priv = mode === "private";
  acc.push({ who: "A", page: 0, op: "escreve", kind: priv ? "cow" : "compartilhada", frame: priv ? n : 0 });
  return {
    acc,
    major: n,
    minor: 1,
    frames: n + (priv ? 1 : 0),
    /** Bytes read() would copy from the page cache into a user buffer for the same pages. */
    readCopyKiB: n * PAGE_KIB,
    bSees: !priv,
  };
}
