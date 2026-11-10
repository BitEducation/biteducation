/**
 * Access control: a small access matrix read by columns (ACLs) and by rows (capabilities), and the
 * UNIX check, which picks exactly one class (owner, group or others) and uses only its three bits.
 */
export type Right = "r" | "w" | "x";

export const SUBJECTS = ["ana", "bruno", "carla", "backup"] as const;
export const OBJECTS = ["notas.txt", "prova.pdf", "impressora"] as const;
/** Rights of each subject on each object, "" when it has none. */
export const MATRIX: Record<(typeof SUBJECTS)[number], string[]> = {
  ana: ["rw", "rw", "w"],
  bruno: ["r", "", "w"],
  carla: ["", "", "w"],
  backup: ["r", "r", ""],
};

/** One ACL per object: the non-empty entries of its column. */
export const acl = (o: number) => SUBJECTS.filter((s) => MATRIX[s][o]).map((s) => `${s}: ${MATRIX[s][o]}`);
/** One capability list per subject: the non-empty entries of its row. */
export const caps = (s: (typeof SUBJECTS)[number]) =>
  OBJECTS.flatMap((o, i) => (MATRIX[s][i] ? [`${o}: ${MATRIX[s][i]}`] : []));

export const modeString = (mode: number) =>
  [6, 3, 0]
    .map((sh) => {
      const v = (mode >> sh) & 7;
      return `${v & 4 ? "r" : "-"}${v & 2 ? "w" : "-"}${v & 1 ? "x" : "-"}`;
    })
    .join("");

export interface File {
  owner: string;
  group: string;
  mode: number;
}
export interface User {
  name: string;
  groups: string[];
}
export type Class = "dono" | "grupo" | "outros";

export function unixCheck(f: File, u: User, want: Right) {
  const cls: Class = u.name === f.owner ? "dono" : u.groups.includes(f.group) ? "grupo" : "outros";
  const shift = cls === "dono" ? 6 : cls === "grupo" ? 3 : 0;
  const bits = modeString(f.mode).slice(6 - shift, 9 - shift);
  const bit = want === "r" ? 4 : want === "w" ? 2 : 1;
  return { cls, bits, ok: ((f.mode >> shift) & 7 & bit) !== 0 };
}
