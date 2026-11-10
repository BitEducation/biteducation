import { describe, expect, it } from "vitest";
import { buildPcap, LINKTYPE_ETHERNET, LINKTYPE_RAW } from "../../core/pcap.ts";
import arp from "./lessons/arp-spoofing.ts";
import encapsulamento from "./lessons/encapsulamento.ts";
import synFlood from "./lessons/syn-flood.ts";
import tls13 from "./lessons/tls13.ts";

/** Minimal reader, independent of the writer, as a stand-in for Wireshark. */
function readPcap(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(v.getUint32(0, true)).toBe(0xa1b2c3d4);
  expect([v.getUint16(4, true), v.getUint16(6, true)]).toEqual([2, 4]);
  const linktype = v.getUint32(20, true);
  const packets: Uint8Array[] = [];
  let at = 24;
  let last = -1;
  while (at < bytes.length) {
    const ts = v.getUint32(at, true);
    const incl = v.getUint32(at + 8, true);
    expect(v.getUint32(at + 12, true)).toBe(incl);
    expect(ts).toBeGreaterThan(last);
    last = ts;
    packets.push(bytes.subarray(at + 16, at + 16 + incl));
    at += 16 + incl;
  }
  expect(at).toBe(bytes.length);
  return { linktype, packets };
}

const build = (l: typeof arp) => buildPcap(l.build(l.params.defaults));

describe("pcap export", () => {
  it("encapsulamento: only the three whole Ethernet frames, EtherType IPv4", () => {
    const p = build(encapsulamento);
    const r = readPcap(p?.bytes as Uint8Array);
    expect(r.linktype).toBe(LINKTYPE_ETHERNET);
    expect(r.packets).toHaveLength(3);
    for (const pkt of r.packets) {
      expect(pkt).toHaveLength(164);
      expect([pkt[12], pkt[13]]).toEqual([0x08, 0x00]);
    }
    expect(p?.zeroed).toBe(0);
  });
  it("arp-spoofing: ARP frames with EtherType 0x0806", () => {
    const r = readPcap(build(arp)?.bytes as Uint8Array);
    expect(r.packets.length).toBeGreaterThanOrEqual(3);
    for (const pkt of r.packets) expect([pkt[12], pkt[13]]).toEqual([0x08, 0x06]);
  });
  it("tls13: raw IPv4 packets whose total length matches; encrypted bytes counted as zeroed", () => {
    const p = build(tls13);
    const r = readPcap(p?.bytes as Uint8Array);
    expect(r.linktype).toBe(LINKTYPE_RAW);
    for (const pkt of r.packets) {
      expect((pkt[0] ?? 0) >> 4).toBe(4);
      expect(((pkt[2] ?? 0) << 8) | (pkt[3] ?? 0)).toBe(pkt.length);
    }
    expect(p?.zeroed).toBeGreaterThan(0);
  });
  it("lessons without byte frames give no file", () => {
    expect(build(synFlood)).toBeNull();
  });
});
