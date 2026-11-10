/**
 * UNIX signals (MOS 10.3.2): each process has a pending set,
 * a blocked mask and one disposition per signal. A signal sent while one of the same number is
 * already pending merges with it (standard signals do not queue). Pending, unblocked signals are
 * delivered when the process returns to user mode. SIGKILL and SIGSTOP cannot be caught or blocked.
 */

export const SIG = { SIGINT: 2, SIGKILL: 9, SIGUSR1: 10, SIGTERM: 15, SIGCHLD: 17 } as const;
export type SigName = keyof typeof SIG;
export const ORDER: SigName[] = ["SIGINT", "SIGKILL", "SIGUSR1", "SIGTERM", "SIGCHLD"];

export type Action =
  | { op: "handle"; sig: SigName; handler: string }
  | { op: "block"; sig: SigName }
  | { op: "unblock"; sig: SigName }
  | { op: "send"; sig: SigName; from: string }
  | { op: "return" };

export interface Event {
  action: Action;
  pending: SigName[];
  blocked: SigName[];
  delivered: { sig: SigName; result: string }[];
  merged: boolean;
  refused: boolean;
  alive: boolean;
}

const DEFAULT: Record<SigName, string> = {
  SIGINT: "termina",
  SIGKILL: "termina",
  SIGUSR1: "termina",
  SIGTERM: "termina",
  SIGCHLD: "ignora",
};
const UNCATCHABLE: SigName[] = ["SIGKILL"];

export function run(actions: Action[]): Event[] {
  const pending = new Set<SigName>();
  const blocked = new Set<SigName>();
  const handlers = new Map<SigName, string>();
  let alive = true;
  const out: Event[] = [];
  const snap = () => ({
    pending: ORDER.filter((s) => pending.has(s)),
    blocked: ORDER.filter((s) => blocked.has(s)),
  });
  for (const a of actions) {
    let merged = false;
    let refused = false;
    const delivered: { sig: SigName; result: string }[] = [];
    if (!alive) {
      out.push({ action: a, ...snap(), delivered, merged, refused: true, alive });
      continue;
    }
    if (a.op === "handle") {
      if (UNCATCHABLE.includes(a.sig)) refused = true;
      else handlers.set(a.sig, a.handler);
    } else if (a.op === "block") {
      if (UNCATCHABLE.includes(a.sig)) refused = true;
      else blocked.add(a.sig);
    } else if (a.op === "unblock") blocked.delete(a.sig);
    else if (a.op === "send") {
      merged = pending.has(a.sig);
      pending.add(a.sig);
    }
    // delivery happens on the way back to user mode, which every action ends with
    for (const s of ORDER) {
      if (!alive || !pending.has(s) || blocked.has(s)) continue;
      pending.delete(s);
      const h = handlers.get(s);
      const result = h ?? DEFAULT[s];
      delivered.push({ sig: s, result });
      if (!h && result === "termina") alive = false;
    }
    out.push({ action: a, ...snap(), delivered, merged, refused, alive });
  }
  return out;
}
