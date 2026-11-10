/**
 * Two kernel designs serving the same read(): in a monolithic kernel it is one system call; in a
 * microkernel the file system and the disk driver are user processes, so the request becomes
 * four IPC messages, each one a pair of mode switches. Containers then share one kernel,
 * separated by namespaces and limited by cgroups.
 */

export const MICRO_PATH = [
  ["app_u", "fs_u", "pede read()"],
  ["fs_u", "drv_u", "pede o bloco"],
  ["drv_u", "fs_u", "devolve o bloco"],
  ["fs_u", "app_u", "devolve os dados"],
] as const;

export function kernelsRun(switchNs: number) {
  const mono = { msgs: 0, switches: 2 };
  const micro = { msgs: MICRO_PATH.length, switches: 2 * MICRO_PATH.length };
  return {
    mono: { ...mono, ns: mono.switches * switchNs },
    micro: { ...micro, ns: micro.switches * switchNs },
  };
}

export const CONTAINERS = [
  { name: "web", proc: "nginx", hostPid: 4012 },
  { name: "web", proc: "nginx (worker)", hostPid: 4013 },
  { name: "banco", proc: "postgres", hostPid: 4120 },
] as const;
export const MEM_LIMIT = 256;

export function cgroupRun(usageMiB: number) {
  return { limit: MEM_LIMIT, usage: usageMiB, killed: usageMiB > MEM_LIMIT };
}
