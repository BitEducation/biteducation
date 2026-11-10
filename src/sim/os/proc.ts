/**
 * A tiny process manager: fork with copy-on-write frames, exec, exit, wait and reparenting
 * to init. Frames are shared with a reference count until someone writes.
 */

export type PState = "pronto" | "bloqueado" | "zumbi" | "rodando";

export interface Proc {
  pid: number;
  ppid: number;
  prog: string;
  state: PState;
  /** Virtual page → frame. */
  pages: number[];
  exitCode?: number;
}

export interface Kernel {
  procs: Map<number, Proc>;
  /** Frame → { owner page label, refcount }. */
  frames: ({ label: string; refs: number } | null)[];
  nextPid: number;
}

export function boot(nframes: number): Kernel {
  return { procs: new Map(), frames: Array.from({ length: nframes }, () => null), nextPid: 100 };
}

function alloc(k: Kernel, label: string): number {
  const f = k.frames.indexOf(null);
  if (f < 0) throw new Error("sem quadros livres");
  k.frames[f] = { label, refs: 1 };
  return f;
}

function release(k: Kernel, frame: number) {
  const fr = k.frames[frame];
  if (!fr) return;
  fr.refs -= 1;
  if (fr.refs === 0) k.frames[frame] = null;
}

export function spawn(k: Kernel, pid: number, ppid: number, prog: string, npages: number): Proc {
  const p: Proc = { pid, ppid, prog, state: "pronto", pages: [] };
  for (let i = 0; i < npages; i++) p.pages.push(alloc(k, `${prog}:${i}`));
  k.procs.set(pid, p);
  k.nextPid = Math.max(k.nextPid, pid + 1);
  return p;
}

/** fork: same pages, every frame gains a reference (copy-on-write). Returns the child pid. */
export function fork(k: Kernel, parent: number): number {
  const par = k.procs.get(parent);
  if (!par) throw new Error("pai inexistente");
  const pid = k.nextPid++;
  for (const f of par.pages) {
    const fr = k.frames[f];
    if (fr) fr.refs += 1;
  }
  k.procs.set(pid, { pid, ppid: parent, prog: par.prog, state: "pronto", pages: [...par.pages] });
  return pid;
}

/** Write to a page: a shared frame is copied first (the COW fault). Returns whether it copied. */
export function write(k: Kernel, pid: number, page: number): { copied: boolean; from: number; to: number } {
  const p = k.procs.get(pid);
  const f = p?.pages[page];
  if (!p || f === undefined) throw new Error("página inválida");
  const fr = k.frames[f];
  if (fr && fr.refs > 1) {
    fr.refs -= 1;
    const to = alloc(k, `${fr.label}′`);
    p.pages[page] = to;
    return { copied: true, from: f, to };
  }
  return { copied: false, from: f, to: f };
}

/** exec: drop the old image, load a new program in fresh frames; the pid stays. */
export function exec(k: Kernel, pid: number, prog: string, npages: number) {
  const p = k.procs.get(pid);
  if (!p) throw new Error("processo inexistente");
  for (const f of p.pages) release(k, f);
  p.pages = [];
  p.prog = prog;
  for (let i = 0; i < npages; i++) p.pages.push(alloc(k, `${prog}:${i}`));
}

/** exit: frames go back, the entry stays as a zombie until the parent waits; orphans go to init. */
export function exit(k: Kernel, pid: number, code: number) {
  const p = k.procs.get(pid);
  if (!p) throw new Error("processo inexistente");
  for (const f of p.pages) release(k, f);
  p.pages = [];
  p.state = "zumbi";
  p.exitCode = code;
  for (const c of k.procs.values()) if (c.ppid === pid) c.ppid = 1;
}

/** wait: collects one zombie child, removing its entry. */
export function reap(k: Kernel, parent: number): { pid: number; code: number } | null {
  for (const c of k.procs.values())
    if (c.ppid === parent && c.state === "zumbi") {
      k.procs.delete(c.pid);
      return { pid: c.pid, code: c.exitCode ?? 0 };
    }
  return null;
}

export const usedFrames = (k: Kernel) => k.frames.filter(Boolean).length;
