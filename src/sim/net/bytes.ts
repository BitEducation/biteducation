import type { FieldNode, Frame, Role } from "../../contracts/types.ts";

/**
 * A protocol layer as bytes plus a field tree whose from/to are offsets inside `bytes`.
 * `null` bytes are unknown or encrypted and show as "··" in the inspector.
 */
export interface Layer {
  id: string;
  label: string;
  role: Role;
  bytes: (number | null)[];
  fields: FieldNode[];
}

export const u8 = (v: number) => [v & 0xff];
export const u16 = (v: number) => [(v >>> 8) & 0xff, v & 0xff];
export const u24 = (v: number) => [(v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
export const u32 = (v: number) => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
export const ascii = (s: string) =>
  [...s].map((c) => {
    const code = c.charCodeAt(0);
    if (code > 0x7e) throw new Error("Só ASCII");
    return code;
  });

export function mac(s: string): number[] {
  const parts = s.split(":");
  if (parts.length !== 6 || !parts.every((p) => /^[0-9a-f]{2}$/i.test(p)))
    throw new Error(`MAC inválido: ${s}`);
  return parts.map((p) => Number.parseInt(p, 16));
}

export function ip4(s: string): number[] {
  const parts = s.split(".");
  if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255))
    throw new Error(`IPv4 inválido: ${s}`);
  return parts.map(Number);
}

export const hex2 = (n: number) => n.toString(16).padStart(2, "0");
export const hexN = (n: number, w: number) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(w, "0")}`;

/** Shift a field tree by `delta` bytes. */
export function shift(fields: FieldNode[], delta: number): FieldNode[] {
  return fields.map((f) => ({
    ...f,
    ...(f.from !== undefined ? { from: f.from + delta } : {}),
    ...(f.to !== undefined ? { to: f.to + delta } : {}),
    ...(f.children ? { children: shift(f.children, delta) } : {}),
  }));
}

/** Concatenates layers (outermost first) into an inspector frame. */
export function frameOf(id: string, title: string, summary: string, layers: Layer[], where?: string): Frame {
  const data: (number | null)[] = [];
  const out: Frame["layers"] = [];
  for (const l of layers) {
    const at = data.length;
    data.push(...l.bytes);
    out.push({
      id: l.id,
      label: l.label,
      role: l.role,
      from: at,
      to: data.length,
      fields: shift(l.fields, at),
    });
  }
  return { id, title, summary, unit: "byte", data, layers: out, ...(where ? { where } : {}) };
}

/** Builds a layer field by field, tracking offsets. */
export function layerBuilder(id: string, label: string, role: Role) {
  const bytes: (number | null)[] = [];
  const fields: FieldNode[] = [];
  return {
    field(
      label: string,
      value: string,
      b: (number | null)[],
      extra: Omit<FieldNode, "label" | "value" | "from" | "to"> = {},
    ) {
      fields.push({ label, value, from: bytes.length, to: bytes.length + b.length, ...extra });
      bytes.push(...b);
      return bytes.length - b.length;
    },
    /** Overwrite already-pushed bytes (checksums computed after the fact). */
    patch(at: number, b: number[], value?: string) {
      b.forEach((v, k) => {
        bytes[at + k] = v;
      });
      if (value !== undefined) {
        const f = fields.find((x) => x.from === at);
        if (f) f.value = value;
      }
    },
    get length() {
      return bytes.length;
    },
    bytes,
    fields,
    done(): Layer {
      return { id, label, role, bytes, fields };
    },
  };
}

/** Bytes as plain numbers; throws on unknown bytes (they cannot enter a checksum). */
export function known(b: (number | null)[]): number[] {
  return b.map((x) => {
    if (x === null) throw new Error("Byte desconhecido");
    return x;
  });
}
