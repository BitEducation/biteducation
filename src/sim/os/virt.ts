/**
 * Virtualization costs: trap-and-emulate overhead for privileged instructions, and the
 * two-dimensional page walk of nested paging versus native and shadow page tables.
 */
export const TRAP_CYCLES = 1000;

export interface Instr {
  name: string;
  does: string;
  privileged: boolean;
  sensitive: boolean;
}

/** A guest kernel's mix; popf is the classic sensitive-but-unprivileged x86 case. */
export const GUEST_INSTRS: Instr[] = [
  { name: "add", does: "soma registradores", privileged: false, sensitive: false },
  { name: "cli", does: "desliga interrupções", privileged: true, sensitive: true },
  { name: "mov cr3", does: "troca a tabela de páginas", privileged: true, sensitive: true },
  { name: "out", does: "escreve num dispositivo", privileged: true, sensitive: true },
  { name: "popf", does: "restaura flags, inclusive IF", privileged: false, sensitive: true },
];

export type Fate = "roda direto" | "armadilha e emulação" | "falha calada";

/** What happens when the guest kernel, running unprivileged, executes the instruction. */
export const fate = (i: Instr): Fate =>
  !i.sensitive ? "roda direto" : i.privileged ? "armadilha e emulação" : "falha calada";

/** Run time relative to native, with `perTenK` sensitive instructions every 10 000, 1 cycle each. */
export const slowdown = (perTenK: number, trap = TRAP_CYCLES) => (10_000 + perTenK * trap) / 10_000;

/** Memory reads to translate one address after a TLB miss. */
export const nativeWalk = (levels: number) => levels;

/** Every guest table pointer is a guest-physical address that needs its own host walk. */
export const nestedWalk = (guest: number, host: number) => (guest + 1) * (host + 1) - 1;

export function nestedSteps(guest: number, host: number) {
  const rows = Array.from({ length: guest }, (_, i) => ({
    what: `nível ${i + 1} do convidado`,
    reads: host + 1,
  }));
  rows.push({ what: "endereço final do dado", reads: host });
  return rows;
}
