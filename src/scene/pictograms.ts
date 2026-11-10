import type { NodeKind } from "../contracts/types.ts";

/**
 * Device drawings for scene nodes, 32×32. The boxy ones are built in 3D and projected
 * isometrically, so every device shares one light direction: lit top (.ft), mid left
 * face (.fl), dark right face (.fr). CSS colors the faces from the site accent.
 * Trusted markup (no user data).
 */

type P3 = readonly [x: number, y: number, z: number];
type Shape =
  | { box: readonly [x: number, y: number, z: number, w: number, d: number, h: number]; cls?: string }
  | { poly: readonly P3[]; cls: string }
  | { line: readonly P3[] }
  | { dot: P3; r?: number };

const COS = Math.cos(Math.PI / 6);
const project = ([x, y, z]: P3): [number, number] => [(x - y) * COS, (x + y) * 0.5 - z];

function boxFaces([x, y, z, w, d, h]: readonly number[]): { poly: P3[]; cls: string }[] {
  const [x0, y0, z0] = [x as number, y as number, z as number];
  const [x1, y1, z1] = [x0 + (w as number), y0 + (d as number), z0 + (h as number)];
  return [
    {
      cls: "fl",
      poly: [
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
    },
    {
      cls: "fr",
      poly: [
        [x1, y0, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x1, y0, z1],
      ],
    },
    {
      cls: "ft",
      poly: [
        [x0, y0, z1],
        [x1, y0, z1],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
    },
  ];
}

const f = (n: number) => Number(n.toFixed(2));

/** Projects the shapes and fits them, centered, into the 32×32 box (30 px of drawing). */
function iso(input: Shape[]): string {
  // Ground shadow under the first box, cast toward the lower right as in the light above.
  const first = input.find((x) => "box" in x);
  const shapes: Shape[] =
    first && "box" in first && first.box[2] === 0
      ? [
          {
            cls: "sh",
            poly: (() => {
              const [x, y, , w, d] = first.box;
              const [sx, sy] = [x + 3.5, y + 0.5];
              return [
                [sx, sy, 0],
                [sx + w, sy, 0],
                [sx + w, sy + d, 0],
                [sx, sy + d, 0],
              ] as P3[];
            })(),
          },
          ...input,
        ]
      : input;
  const pts: [number, number][] = [];
  for (const s of shapes) {
    if ("box" in s) for (const face of boxFaces(s.box)) pts.push(...face.poly.map(project));
    else if ("poly" in s) pts.push(...s.poly.map(project));
    else if ("line" in s) pts.push(...s.line.map(project));
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = 30 / Math.max(maxX - minX, maxY - minY);
  const ox = 16 - ((minX + maxX) / 2) * k;
  const oy = 16 - ((minY + maxY) / 2) * k;
  const at = (p: P3) => {
    const [a, b] = project(p);
    return `${f(a * k + ox)},${f(b * k + oy)}`;
  };
  const out: string[] = [];
  for (const s of shapes) {
    if ("box" in s)
      for (const face of boxFaces(s.box))
        out.push(
          `<polygon class="${face.cls}${s.cls ? ` ${s.cls}` : ""}" points="${face.poly.map(at).join(" ")}"/>`,
        );
    else if ("poly" in s) out.push(`<polygon class="${s.cls}" points="${s.poly.map(at).join(" ")}"/>`);
    else if ("line" in s) out.push(`<polyline class="ln" points="${s.line.map(at).join(" ")}"/>`);
    else
      out.push(
        `<circle class="lit" cx="${at(s.dot).split(",")[0]}" cy="${at(s.dot).split(",")[1]}" r="${f((s.r ?? 0.7) * k)}"/>`,
      );
  }
  return out.join("");
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
/** A flat rectangle on the left face (plane y = y), from x0..x1 and z0..z1. */
const onLeft = (y: number, x0: number, x1: number, z0: number, z1: number, cls = "fs"): Shape => ({
  cls,
  poly: [
    [x0, y, z0],
    [x1, y, z0],
    [x1, y, z1],
    [x0, y, z1],
  ],
});

const ISO: Partial<Record<NodeKind, Shape[]>> = {
  laptop: [
    { box: [0, 0, 0, 16, 11, 1.4] },
    ...[3.5, 5.5, 7.5].map(
      (y): Shape => ({
        line: [
          [2.5, y, 1.4],
          [13.5, y, 1.4],
        ],
      }),
    ),
    { box: [0, -1, 1.4, 16, 1, 10.5] },
    onLeft(0, 1.3, 14.7, 2.6, 10.6, "fs"),
  ],
  server: [
    ...[0, 6, 12].flatMap((z): Shape[] => [
      { box: [0, 0, z, 12, 12, 5] },
      { dot: [2.2, 12, z + 2.5], r: 0.75 },
      {
        line: [
          [5, 12, z + 2.5],
          [10, 12, z + 2.5],
        ],
      },
    ]),
  ],
  router: [
    { box: [0, 0, 0, 16, 11, 5] },
    {
      line: [
        [2, 2, 5],
        [2, 2, 13],
      ],
    },
    {
      line: [
        [14, 2, 5],
        [14, 2, 13],
      ],
    },
    ...range(4).map((i): Shape => ({ dot: [2.5 + i * 2.2, 11, 2.5], r: 0.6 })),
    onLeft(11, 11, 14.5, 1.3, 3.7),
  ],
  switch: [
    { box: [0, 0, 0, 20, 9, 3.6] },
    ...range(6).map((i) => onLeft(9, 1.6 + i * 3, 3.6 + i * 3, 0.8, 2.6)),
  ],
  cpu: [
    { box: [0, 0, 0, 14, 14, 2] },
    ...range(5).map(
      (i): Shape => ({
        line: [
          [2.5 + i * 2.25, 14, 1],
          [2.5 + i * 2.25, 16, 1],
        ],
      }),
    ),
    ...range(5).map(
      (i): Shape => ({
        line: [
          [14, 2.5 + i * 2.25, 1],
          [16, 2.5 + i * 2.25, 1],
        ],
      }),
    ),
    { box: [4, 4, 2, 6, 6, 1], cls: "lit" },
  ],
  memory: [
    { box: [0, 0, 0, 22, 3, 7] },
    ...range(4).map((i) => onLeft(3, 1.5 + i * 5, 4.8 + i * 5, 2, 5.6, "fs")),
    {
      line: [
        [1, 3, 0.8],
        [21, 3, 0.8],
      ],
    },
  ],
  regfile: range(4).map((i): Shape => ({ box: [0, 0, i * 3.3, 14, 10, 2.3] })),
  cache: [
    { box: [0, 0, 0, 14, 14, 7] },
    ...[14 / 3, 28 / 3].flatMap((v): Shape[] => [
      {
        line: [
          [v, 0, 7],
          [v, 14, 7],
        ],
      },
      {
        line: [
          [0, v, 7],
          [14, v, 7],
        ],
      },
    ]),
  ],
  imem: [
    { box: [0, 0, 0, 12, 12, 10] },
    ...[7.5, 5.5, 3.5].map(
      (z, i): Shape => ({
        line: [
          [2, 12, z],
          [i === 2 ? 7 : 10, 12, z],
        ],
      }),
    ),
  ],
  dmem: [
    { box: [0, 0, 0, 12, 12, 10] },
    ...[7.5, 5, 2.5].flatMap((z): Shape[] => [
      { dot: [3, 12, z], r: 0.6 },
      { dot: [6, 12, z], r: 0.6 },
      { dot: [9, 12, z], r: 0.6 },
    ]),
  ],
  pc: [
    { box: [0, 0, 0, 14, 9, 6] },
    {
      line: [
        [2.5, 9, 3],
        [11, 9, 3],
      ],
    },
    {
      line: [
        [9, 9, 4.6],
        [11, 9, 3],
        [9, 9, 1.4],
      ],
    },
  ],
  device: [
    { box: [0, 0, 0, 14, 10, 6] },
    { dot: [11.5, 10, 4], r: 0.7 },
    {
      line: [
        [2.5, 10, 2],
        [8, 10, 2],
      ],
    },
  ],
  firewall: [
    { box: [0, 0, 0, 18, 4, 11] },
    {
      line: [
        [0, 4, 3.7],
        [18, 4, 3.7],
      ],
    },
    {
      line: [
        [0, 4, 7.4],
        [18, 4, 7.4],
      ],
    },
    ...[6, 12].map(
      (x): Shape => ({
        line: [
          [x, 4, 0],
          [x, 4, 3.7],
        ],
      }),
    ),
    ...[3, 9, 15].map(
      (x): Shape => ({
        line: [
          [x, 4, 3.7],
          [x, 4, 7.4],
        ],
      }),
    ),
    ...[6, 12].map(
      (x): Shape => ({
        line: [
          [x, 4, 7.4],
          [x, 4, 11],
        ],
      }),
    ),
  ],
  kernel: [
    { box: [0, 0, 0, 14, 14, 6] },
    {
      cls: "lit",
      poly: range(12).map(
        (i): P3 => [7 + 3.6 * Math.cos((i * Math.PI) / 6), 7 + 3.6 * Math.sin((i * Math.PI) / 6), 6],
      ),
    },
  ],
};

/** Shapes that have no box form, drawn flat in the same 32×32 box and the same face colors. */
const FLAT: Partial<Record<NodeKind, string>> = {
  cloud: `<ellipse class="sh" cx="18.5" cy="26" rx="11" ry="2.4"/><path class="fl" d="M9 25h15.5a5.5 5.5 0 0 0 .6-11A8 8 0 0 0 9.8 12.6 6.3 6.3 0 0 0 9 25z"/><path class="ln" d="M12.5 18.5a3.4 3.4 0 0 1 3.2-2.6"/>`,
  dns: `<ellipse class="sh" cx="18" cy="29" rx="9" ry="2"/><circle class="fl" cx="16" cy="16" r="12"/><path class="ln" d="M4 16h24M16 4c-4.5 4-4.5 20 0 24M16 4c4.5 4 4.5 20 0 24M6 10h20M6 22h20"/>`,
  attacker: `<path class="fl" d="M5 14c2.5-8 19.5-8 22 0z"/><path class="ft" d="M3.5 14h25l-2 2.5h-21z"/><circle class="fs" cx="11" cy="21.5" r="3.2"/><circle class="fs" cx="21" cy="21.5" r="3.2"/><path class="ln" d="M14.2 21.5h3.6"/>`,
  process: `<rect class="fl" x="4" y="6" width="24" height="20" rx="2"/><path class="ft" d="M6 6h20a2 2 0 0 1 2 2v3H4V8a2 2 0 0 1 2-2z"/><circle class="lit" cx="7.5" cy="8.5" r="1"/><path class="ln" d="M8 16h11M8 20h7"/>`,
  timer: `<circle class="fl" cx="16" cy="18" r="10"/><path class="ft" d="M13 4h6v3h-6z"/><path class="ln" d="M16 18v-6M16 18l4 2.5"/>`,
  alu: `<path class="fl" d="M4 6h9l3 5 3-5h9l-5 20H9z"/><path class="ln" d="M12.5 19h7"/>`,
  disk: `<path class="fl" d="M6 9v14c0 2.2 4.5 4 10 4s10-1.8 10-4V9"/><ellipse class="ft" cx="16" cy="9" rx="10" ry="4"/><path class="ln" d="M6 16c0 2.2 4.5 4 10 4s10-1.8 10-4"/><circle class="lit" cx="22" cy="22.5" r="1"/>`,
};

const CACHE = new Map<NodeKind, string>();

export function pictogram(kind: NodeKind): string {
  const hit = CACHE.get(kind);
  if (hit !== undefined) return hit;
  const shapes = ISO[kind];
  const out = shapes ? iso(shapes) : (FLAT[kind] ?? "");
  CACHE.set(kind, out);
  return out;
}

/** Size of the drawing box, used by the renderer and by nodeSize(). */
export const PICT_SIZE = 32;
/** Equipment is drawn larger and without a box around it. */
export const DEVICE_SIZE = 50;

const DEVICES: ReadonlySet<NodeKind> = new Set([
  "laptop",
  "server",
  "router",
  "switch",
  "cloud",
  "attacker",
  "firewall",
  "dns",
  "device",
] as NodeKind[]);

export function isDevice(kind: NodeKind): boolean {
  return DEVICES.has(kind);
}
