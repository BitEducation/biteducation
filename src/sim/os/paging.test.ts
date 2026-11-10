import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type PagingConfig, runPaging } from "./paging.ts";

const cfg: PagingConfig = { vaBits: 16, pageSize: 4096, tlbSize: 2, frames: 3, resident: { 0: 2, 1: 0 } };

describe("paging", () => {
  it("splits the address into VPN and offset (worked by hand)", () => {
    // 0x1234 = 0001 | 0010 0011 0100 -> vpn 1, offset 0x234; vpn 1 is in frame 0 -> 0x0234
    const r = runPaging(cfg, [0x1234]);
    expect(r.offsetBits).toBe(12);
    expect(r.vpnBits).toBe(4);
    const a = r.accesses[0];
    expect(a).toMatchObject({ vpn: 1, offset: 0x234, tlbHit: false, fault: false, frame: 0, paddr: 0x0234 });
  });
  it("second access to the same page hits the TLB", () => {
    const r = runPaging(cfg, [0x1234, 0x1ff0]);
    expect(r.accesses[1]?.tlbHit).toBe(true);
    expect(r.hits).toBe(1);
  });
  it("page fault takes a free frame, then FIFO evicts the oldest page", () => {
    // resident: vpn0->f2, vpn1->f0; free: f1
    const r = runPaging(cfg, [0x5000, 0x6000]);
    expect(r.accesses[0]).toMatchObject({ vpn: 5, fault: true, frame: 1, victim: null });
    // no free frame: FIFO victim is vpn 0 (first resident), its frame 2 is reused
    expect(r.accesses[1]).toMatchObject({ vpn: 6, fault: true, frame: 2, victim: 0 });
    expect(r.accesses[1]?.table[0]?.present).toBe(false);
    expect(r.faults).toBe(2);
  });
  it("TLB uses LRU", () => {
    const r = runPaging(cfg, [0x0000, 0x1000, 0x0004, 0x5000]);
    // after A0, A1, A0 the LRU entry is vpn 1
    expect(r.accesses[3]?.tlbEvicted).toBe(1);
    expect(r.accesses[3]?.tlb.map((e) => e.vpn).sort()).toEqual([0, 5]);
  });
  it("tracks accessed and dirty bits; a dirty victim needs a write-back", () => {
    const one = { ...cfg, frames: 1, resident: {} };
    const r = runPaging(one, [{ addr: 0x2000, write: true }, 0x3000]);
    expect(r.accesses[0]?.table[2]).toMatchObject({ present: true, accessed: true, dirty: true });
    expect(r.accesses[1]).toMatchObject({ victim: 2, victimDirty: true });
  });
  it("TLB FIFO evicts the oldest entry even if recently used", () => {
    const r = runPaging({ ...cfg, tlbPolicy: "fifo" }, [0x0000, 0x1000, 0x0004, 0x5000]);
    expect(r.accesses[3]?.tlbEvicted).toBe(0);
  });
  it("rejects bad configs and addresses", () => {
    expect(() => runPaging({ ...cfg, pageSize: 3000 }, [])).toThrow();
    expect(() => runPaging(cfg, [0x10000])).toThrow();
    expect(() => runPaging({ ...cfg, resident: { 0: 1, 1: 1 } }, [])).toThrow();
  });
  it("properties: translation preserves the offset; TLB never exceeds its size; resident ≤ frames", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 0xffff }), { maxLength: 40 }),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 6 }),
        (addrs, tlbSize, frames) => {
          const r = runPaging({ vaBits: 16, pageSize: 4096, tlbSize, frames, resident: {} }, addrs);
          for (const a of r.accesses) {
            expect(a.paddr & 0xfff).toBe(a.vaddr & 0xfff);
            expect(a.tlb.length).toBeLessThanOrEqual(tlbSize);
            expect(a.table.filter((p) => p.present).length).toBeLessThanOrEqual(frames);
            const pte = a.table[a.vpn];
            expect(pte?.present && pte.frame === a.frame).toBe(true);
          }
          expect(r.hits + r.misses).toBe(addrs.length);
        },
      ),
    );
  });
});
