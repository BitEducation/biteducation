/**
 * One video source and a small router tree. With unicast, every receiver gets its own copy along
 * its whole path; with multicast, each link carries one copy if any member is downstream.
 * Pruning removes branches whose members all left.
 */

export const PARENT: Record<string, string> = {
  R1: "S",
  R2: "R1",
  R3: "R1",
  R4: "R3",
  H1: "R2",
  H2: "R2",
  H3: "R3",
  H4: "R4",
  H5: "R4",
};
export const HOSTS = ["H1", "H2", "H3", "H4", "H5"];
/** Join order used by the Lab's member count. */
export const JOIN_ORDER = ["H1", "H4", "H2", "H5", "H3"];
export const LINKS = Object.entries(PARENT).map(([child, parent]) => ({
  id: `${parent}-${child}`,
  parent,
  child,
}));

export function path(host: string): string[] {
  const out: string[] = [];
  let n = host;
  while (PARENT[n]) {
    const p = PARENT[n] as string;
    out.unshift(`${p}-${n}`);
    n = p;
  }
  return out;
}

export function load(members: string[]) {
  const uni: Record<string, number> = {};
  const multi: Record<string, number> = {};
  for (const l of LINKS) {
    uni[l.id] = 0;
    multi[l.id] = 0;
  }
  for (const h of members)
    for (const l of path(h)) {
      uni[l] = (uni[l] ?? 0) + 1;
      multi[l] = 1;
    }
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, x) => a + x, 0);
  return { uni, multi, uniTotal: sum(uni), multiTotal: sum(multi), fromSource: uni["S-R1"] ?? 0 };
}

export const membersOf = (k: number) => JOIN_ORDER.slice(0, Math.min(HOSTS.length, Math.max(1, k)));
