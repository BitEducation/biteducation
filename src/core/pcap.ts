import type { Frame, LessonRun } from "../contracts/types.ts";

/**
 * Classic pcap writer: magic 0xa1b2c3d4, version 2.4, little endian.
 * Uses the byte frames the trace references, in trace order, each once. When the lesson has
 * whole Ethernet frames, only those go in (linktype 1); otherwise frames that start at the IP
 * header go in as raw IP (linktype 101). Unknown bytes (null) become 0 and are counted.
 */
export const LINKTYPE_ETHERNET = 1;
export const LINKTYPE_RAW = 101;

export interface Pcap {
  bytes: Uint8Array<ArrayBuffer>;
  packets: number;
  linktype: number;
  zeroed: number;
}

function framesInOrder(run: LessonRun): Frame[] {
  const seen = new Set<string>();
  const out: Frame[] = [];
  for (const ev of run.trace) {
    const f = ev.frame ? run.frames[ev.frame] : undefined;
    if (f && f.unit === "byte" && !seen.has(f.id)) {
      seen.add(f.id);
      out.push(f);
    }
  }
  return out;
}

export function buildPcap(run: LessonRun): Pcap | null {
  const all = framesInOrder(run);
  const eth = all.filter((f) => f.layers[0]?.id === "eth");
  const linktype = eth.length ? LINKTYPE_ETHERNET : LINKTYPE_RAW;
  const frames = eth.length ? eth : all.filter((f) => f.layers[0]?.id === "ip");
  if (!frames.length) return null;

  const size = 24 + frames.reduce((n, f) => n + 16 + f.data.length, 0);
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xa1b2c3d4, true);
  view.setUint16(4, 2, true);
  view.setUint16(6, 4, true);
  view.setInt32(8, 0, true); // thiszone
  view.setUint32(12, 0, true); // sigfigs
  view.setUint32(16, 65535, true); // snaplen
  view.setUint32(20, linktype, true);

  let at = 24;
  let zeroed = 0;
  frames.forEach((f, i) => {
    // One packet per second keeps the capture readable; the lesson's own times are logical.
    view.setUint32(at, i, true);
    view.setUint32(at + 4, 0, true);
    view.setUint32(at + 8, f.data.length, true);
    view.setUint32(at + 12, f.data.length, true);
    at += 16;
    for (const b of f.data) {
      if (b === null) zeroed++;
      bytes[at++] = b ?? 0;
    }
  });
  return { bytes, packets: frames.length, linktype, zeroed };
}
