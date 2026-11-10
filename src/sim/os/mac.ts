/**
 * Mandatory access control with three ordered levels. Bell-LaPadula protects confidentiality
 * (no read up, no write down); Biba is its dual for integrity (no read down, no write up).
 * Labels are set by the system, not by the owner of the file.
 */

export const LEVELS = ["público", "confidencial", "secreto"] as const;
export const SUBJECTS = [
  { name: "estagiário", level: 0 },
  { name: "analista", level: 1 },
  { name: "diretora", level: 2 },
] as const;
export const OBJECTS = [
  { name: "cardápio", level: 0 },
  { name: "relatório", level: 1 },
  { name: "plano", level: 2 },
] as const;

export type MacPolicy = "blp" | "biba";
export type Op = "ler" | "escrever";

export function allowed(policy: MacPolicy, s: number, o: number, op: Op): boolean {
  if (policy === "blp") return op === "ler" ? s >= o : s <= o;
  return op === "ler" ? s <= o : s >= o;
}

export function matrix(policy: MacPolicy, op: Op): boolean[][] {
  return SUBJECTS.map((s) => OBJECTS.map((o) => allowed(policy, s.level, o.level, op)));
}

export const count = (m: boolean[][]) => m.flat().filter(Boolean).length;
