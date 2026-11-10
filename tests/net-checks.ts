import { expect } from "vitest";
import type { LessonRun } from "../src/contracts/types.ts";
import { inetChecksum } from "../src/sim/net/checksum.ts";
import { pseudoHeader } from "../src/sim/net/ipv4.ts";
import { pseudoHeader6 } from "../src/sim/net/ipv6.ts";

const PROTO: Record<string, number> = { tcp: 6, udp: 17, icmp6: 58 };

/**
 * Every IPv4 header checksum, and every TCP/UDP/ICMP/ICMPv6 checksum over its pseudo-header,
 * verifies to zero in every byte frame of the run. Frames with unknown bytes are skipped.
 */
export function expectChecksums(run: LessonRun): number {
  let checked = 0;
  for (const f of Object.values(run.frames)) {
    if (f.unit !== "byte" || f.data.some((b) => b === null)) continue;
    const data = f.data as number[];
    const ip = f.layers.find((l) => l.id === "ip");
    if (!ip) continue;
    const v6 = ip.label === "IPv6";
    const hdr = data.slice(ip.from, ip.to);
    if (!v6) expect(inetChecksum(hdr), `${f.id}: IPv4`).toBe(0);
    const src = v6 ? hdr.slice(8, 24) : hdr.slice(12, 16);
    const dst = v6 ? hdr.slice(24, 40) : hdr.slice(16, 20);
    const next = f.layers[f.layers.indexOf(ip) + 1];
    if (!next) continue;
    const seg = data.slice(next.from);
    if (next.id === "icmp") expect(inetChecksum(seg), `${f.id}: ICMP`).toBe(0);
    else if (next.id in PROTO) {
      const proto = PROTO[next.id] as number;
      const text6 = (b: number[]) =>
        Array.from({ length: 8 }, (_, i) => (((b[2 * i] ?? 0) << 8) | (b[2 * i + 1] ?? 0)).toString(16)).join(
          ":",
        );
      const pseudo = v6
        ? pseudoHeader6(text6(src), text6(dst), proto, seg.length)
        : pseudoHeader(src.join("."), dst.join("."), proto, seg.length);
      expect(inetChecksum([...pseudo, ...seg]), `${f.id}: ${next.id}`).toBe(0);
    } else continue;
    checked++;
  }
  return checked;
}
