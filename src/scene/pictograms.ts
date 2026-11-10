import type { NodeKind } from "../contracts/types.ts";

/** Project-drawn pictograms for scene nodes (20×20, stroke style). Trusted markup. */
const S =
  'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

const P: Record<NodeKind, string> = {
  laptop: `<rect x="4" y="4" width="12" height="8.5" rx="1" ${S}/><path d="M2 15.5h16l-1.5-3h-13z" ${S}/>`,
  server: `<rect x="4" y="2.5" width="12" height="6.5" rx="1" ${S}/><rect x="4" y="11" width="12" height="6.5" rx="1" ${S}/><circle cx="7" cy="5.75" r=".8" fill="currentColor"/><circle cx="7" cy="14.25" r=".8" fill="currentColor"/>`,
  router: `<rect x="2.5" y="9" width="15" height="7" rx="1.5" ${S}/><path d="M6 9 4.5 4.5M14 9l1.5-4.5" ${S}/><circle cx="6" cy="12.5" r=".8" fill="currentColor"/><circle cx="9" cy="12.5" r=".8" fill="currentColor"/>`,
  switch: `<rect x="2.5" y="6" width="15" height="8" rx="1.5" ${S}/><path d="M5 10h1.5M8 10h1.5M11 10h1.5M14 10h1" ${S}/>`,
  cloud: `<path d="M6 15.5h8.5a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 5.3 8 3.8 3.8 0 0 0 6 15.5z" ${S}/>`,
  attacker: `<path d="M3 8.5c2-4.5 12-4.5 14 0" ${S}/><path d="M3.5 8.5h13l-1.5 1.5H5z" ${S}/><circle cx="7" cy="13" r="2" ${S}/><circle cx="13" cy="13" r="2" ${S}/><path d="M9 13h2" ${S}/>`,
  firewall: `<rect x="3" y="3.5" width="14" height="13" rx="1" ${S}/><path d="M3 8h14M3 12.5h14M8 3.5V8M12 8v4.5M8 12.5v4" ${S}/>`,
  dns: `<circle cx="10" cy="10" r="7" ${S}/><path d="M3 10h14M10 3a10 10 0 0 1 0 14M10 3a10 10 0 0 0 0 14" ${S}/>`,
  cpu: `<rect x="5" y="5" width="10" height="10" rx="1" ${S}/><rect x="8" y="8" width="4" height="4" ${S}/><path d="M8 2.5V5M12 2.5V5M8 15v2.5M12 15v2.5M2.5 8H5M2.5 12H5M15 8h2.5M15 12h2.5" ${S}/>`,
  process: `<rect x="3" y="4" width="14" height="12" rx="1.5" ${S}/><path d="M3 7.5h14M6 11h5M6 13.5h3" ${S}/>`,
  kernel: `<path d="M10 2.5 16.5 6v8L10 17.5 3.5 14V6z" ${S}/><circle cx="10" cy="10" r="2.5" ${S}/>`,
  disk: `<ellipse cx="10" cy="5" rx="6.5" ry="2.5" ${S}/><path d="M3.5 5v10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V5M3.5 10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" ${S}/>`,
  device: `<rect x="3" y="5" width="14" height="10" rx="1.5" ${S}/><path d="M6 12.5h8" ${S}/><circle cx="14" cy="8" r=".8" fill="currentColor"/>`,
  timer: `<circle cx="10" cy="11" r="6" ${S}/><path d="M10 11V7.5M8 2.5h4" ${S}/>`,
  memory: `<rect x="2.5" y="6" width="15" height="8" rx="1" ${S}/><path d="M5.5 6v8M8.5 6v8M11.5 6v8M14.5 6v8M4 14v2M16 14v2" ${S}/>`,
  alu: `<path d="M3 4h5l2 3 2-3h5l-3 12H6z" ${S}/>`,
  regfile: `<rect x="4" y="3" width="12" height="14" rx="1" ${S}/><path d="M4 6.5h12M4 10h12M4 13.5h12" ${S}/>`,
  pc: `<rect x="3" y="6" width="14" height="8" rx="1" ${S}/><path d="M6 10h8M11.5 7.5 14 10l-2.5 2.5" ${S}/>`,
  imem: `<rect x="4" y="3" width="12" height="14" rx="1" ${S}/><path d="M7 7h6M7 10h6M7 13h4" ${S}/>`,
  dmem: `<rect x="4" y="3" width="12" height="14" rx="1" ${S}/><path d="M7 7h2M11 7h2M7 10h2M11 10h2M7 13h2M11 13h2" ${S}/>`,
  cache: `<rect x="3" y="3" width="14" height="14" rx="1" ${S}/><path d="M3 8h14M3 12.5h14M8 3v14" ${S}/>`,
  box: "",
  layer: "",
};

export function pictogram(kind: NodeKind): string {
  return P[kind] ?? "";
}
