import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arp } from "./arp.ts";
import { frameOf, known } from "./bytes.ts";
import { inetChecksum } from "./checksum.ts";
import { ETHERTYPE, ethernet } from "./ethernet.ts";
import { DEFAULT_RULES, runIds, synRecvAlerts } from "./ids.ts";
import { ipv4, PROTO, pseudoHeader } from "./ipv4.ts";
import { checkCookie, runFlood, synCookie } from "./synflood.ts";
import { tcp } from "./tcp.ts";
import { runFlow } from "./tcp-flow.ts";
import { clientHello, encrypted, serverHello } from "./tls13.ts";

const word = (b: number[], i: number) => ((b[i] as number) << 8) | (b[i + 1] as number);

describe("checksum (RFC 1071)", () => {
  it("matches the classic IPv4 header vector (0xB861)", () => {
    const hdr = [
      0x45, 0x00, 0x00, 0x73, 0x00, 0x00, 0x40, 0x00, 0x40, 0x11, 0x00, 0x00, 0xc0, 0xa8, 0x00, 0x01, 0xc0,
      0xa8, 0x00, 0xc7,
    ];
    expect(inetChecksum(hdr)).toBe(0xb861);
    hdr[10] = 0xb8;
    hdr[11] = 0x61;
    expect(inetChecksum(hdr)).toBe(0);
  });
  it("RFC 1071 §3 example sums to 0xDDF2 (checksum 0x220D)", () => {
    expect(inetChecksum([0x00, 0x01, 0xf2, 0x03, 0xf4, 0xf5, 0xf6, 0xf7])).toBe(0x220d);
  });
  it("property: inserting the checksum makes the sum verify", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 255 }), { minLength: 2, maxLength: 80 }), (raw) => {
        const b = raw.length % 2 ? [...raw, 0] : [...raw];
        b[0] = 0;
        b[1] = 0;
        const c = inetChecksum(b);
        b[0] = c >> 8;
        b[1] = c & 0xff;
        expect(inetChecksum(b)).toBe(0);
      }),
    );
  });
});

describe("encoders", () => {
  it("ethernet is 14 bytes with the EtherType at the end", () => {
    const e = ethernet("ff:ff:ff:ff:ff:ff", "02:00:00:20:00:42", ETHERTYPE.arp);
    expect(e.bytes).toHaveLength(14);
    expect(word(known(e.bytes), 12)).toBe(0x0806);
  });
  it("arp is 28 bytes, op at offset 6", () => {
    const a = arp({
      op: "reply",
      senderMac: "02:00:00:20:00:66",
      senderIp: "10.20.0.1",
      targetMac: "02:00:00:20:00:42",
      targetIp: "10.20.0.42",
    });
    const b = known(a.bytes);
    expect(b).toHaveLength(28);
    expect(word(b, 6)).toBe(2);
    expect(b.slice(14, 18)).toEqual([10, 20, 0, 1]);
  });
  it("ipv4 header verifies and carries total length", () => {
    const h = known(
      ipv4({ src: "10.20.0.42", dst: "192.0.2.10", proto: PROTO.tcp, payloadLen: 40, id: 0x1c46 }).bytes,
    );
    expect(h).toHaveLength(20);
    expect(inetChecksum(h)).toBe(0);
    expect(word(h, 2)).toBe(60);
  });
  it("tcp checksum verifies with the pseudo-header; SYN carries MSS", () => {
    const payload = [...Buffer.from("GET / HTTP/1.1\r\n\r\n")];
    const t = tcp({
      srcIp: "10.20.0.42",
      dstIp: "192.0.2.10",
      sport: 51000,
      dport: 80,
      seq: 1000,
      ack: 2000,
      flags: ["PSH", "ACK"],
      window: 64240,
      payload,
    });
    const seg = [...known(t.bytes), ...payload];
    expect(inetChecksum([...pseudoHeader("10.20.0.42", "192.0.2.10", 6, seg.length), ...seg])).toBe(0);
    const syn = known(
      tcp({
        srcIp: "10.20.0.42",
        dstIp: "192.0.2.10",
        sport: 51000,
        dport: 80,
        seq: 1,
        ack: 0,
        flags: ["SYN"],
        window: 64240,
        mss: 1460,
      }).bytes,
    );
    expect(syn).toHaveLength(24);
    expect(syn[12]).toBe(0x60);
    expect(syn[13]).toBe(0x02);
    expect(word(syn, 22)).toBe(1460);
  });
  it("frameOf shifts nested fields to absolute offsets", () => {
    const f = frameOf("f", "t", "s", [
      ethernet("02:00:00:00:00:01", "02:00:00:00:00:02", 0x0800),
      ipv4({ src: "10.0.0.1", dst: "10.0.0.2", proto: 6, payloadLen: 0 }),
    ]);
    expect(f.layers[1]).toMatchObject({ from: 14, to: 34 });
    expect(f.layers[1]?.fields.at(-1)).toMatchObject({ from: 30, to: 34 });
  });
});

/** Independent minimal TLS parser: walks lengths the way a decoder would. */
function parseHello(b: number[]) {
  expect(b[0]).toBe(22);
  expect(word(b, 3)).toBe(b.length - 5);
  const hsLen = ((b[6] as number) << 16) | word(b, 7);
  expect(hsLen).toBe(b.length - 9);
  let i = 9 + 2 + 32;
  i += 1 + (b[i] as number);
  if (b[5] === 1) {
    i += 2 + word(b, i);
    i += 1 + (b[i] as number);
  } else i += 3;
  const extLen = word(b, i);
  i += 2;
  expect(i + extLen).toBe(b.length);
  const types: number[] = [];
  while (i < b.length) {
    types.push(word(b, i));
    i += 4 + word(b, i + 2);
  }
  expect(i).toBe(b.length);
  return types;
}

describe("tls13", () => {
  const r = Array.from({ length: 32 }, (_, k) => k);
  it("ClientHello lengths are consistent and lists the expected extensions", () => {
    const ch = known(
      clientHello("biblioteca.campus.example", { random: r, sessionId: r, keyShare: r }).bytes,
    );
    expect(parseHello(ch)).toEqual([0, 10, 13, 16, 43, 51]);
  });
  it("ServerHello lengths are consistent", () => {
    const sh = known(serverHello({ random: r, sessionId: r, keyShare: r }).bytes);
    expect(parseHello(sh)).toEqual([43, 51]);
  });
  it("encrypted records keep the length visible and hide the content", () => {
    const e = encrypted(100, "x");
    expect(e.bytes).toHaveLength(5 + 117);
    expect(e.bytes.slice(5).every((x) => x === null)).toBe(true);
  });
});

describe("tcp flow", () => {
  const base = { segments: 5, mss: 1000, window: 5, rtt: 40, seq0: 1001 };
  it("loss of segment 2 → 3 duplicate ACKs → fast retransmit, no timeout", () => {
    const r = runFlow({ ...base, lose: (s, a) => s === 1 && a === 0 });
    expect(r).toMatchObject({ fast: 1, timeouts: 0, retransmits: 1, lost: 1 });
    const dups = r.events.filter((e) => e.kind === "ack" && e.dup > 0);
    expect(dups.map((e) => e.kind === "ack" && e.ack)).toEqual([2001, 2001, 2001]);
    const last = r.events.filter((e) => e.kind === "ack").at(-1);
    expect(last?.kind === "ack" && last.ack).toBe(6001);
  });
  it("losing the last segment needs a timeout (no dup ACKs follow it)", () => {
    const r = runFlow({ ...base, lose: (s, a) => s === 4 && a === 0 });
    expect(r).toMatchObject({ fast: 0, timeouts: 1 });
  });
  it("property: always finishes, and every segment is delivered", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: 2 ** 31 }),
        (segments, window, seed) => {
          const r = runFlow({
            ...base,
            segments,
            window,
            lose: (s, a) => a < 3 && (s * 7 + a * 13 + seed) % 5 === 0,
          });
          const delivered = new Set(
            r.events.filter((e) => e.kind === "recv").map((e) => (e.kind === "recv" ? e.seg : -1)),
          );
          expect(delivered.size).toBe(segments);
        },
      ),
    );
  });
});

describe("syn flood", () => {
  const cfg = {
    ticks: 12,
    backlog: 8,
    rate: 4,
    attackFrom: 2,
    attackTo: 12,
    synTimeout: 5,
    cookies: false,
    legit: [0, 6],
  };
  it("without cookies, Lia gets in before the attack and is refused during it", () => {
    const r = runFlood(cfg);
    expect(r.liaOk).toBe(1);
    expect(r.liaRefused).toBe(1);
    expect(r.maxHalfOpen).toBe(8);
  });
  it("with cookies, Lia gets in during the attack and the backlog never overflows", () => {
    const r = runFlood({ ...cfg, cookies: true });
    expect(r.liaOk).toBe(2);
    expect(r.liaRefused).toBe(0);
    expect(r.cookiesSent).toBeGreaterThan(0);
  });
  it("cookie round-trips and rejects tampering or stale counters", () => {
    const tuple = [10, 20, 0, 42, 0xc7, 0x38, 192, 0, 2, 10, 0, 80];
    const c = synCookie(tuple, 7, 1460, 0xdeadbeef);
    expect(c.mss).toBe(1460);
    expect(checkCookie(c.isn, tuple, 7, 0xdeadbeef)).toBe(true);
    expect(checkCookie(c.isn, tuple, 8, 0xdeadbeef)).toBe(true);
    expect(checkCookie(c.isn, tuple, 10, 0xdeadbeef)).toBe(false);
    expect(checkCookie(c.isn ^ 1, tuple, 7, 0xdeadbeef)).toBe(false);
    expect(checkCookie(c.isn, tuple, 7, 0x12345678)).toBe(false);
  });
  it("SYN_RECV threshold alert fires once per excursion", () => {
    expect(synRecvAlerts([0, 2, 9, 9, 1, 9], 5).map((a) => a.t)).toEqual([2, 5]);
  });
});

describe("ids", () => {
  it("flags unsolicited replies and IP→MAC changes", () => {
    const alerts = runIds(
      [
        {
          i: 0,
          t: 0,
          proto: "arp",
          op: "reply",
          unsolicited: false,
          senderIp: "10.20.0.1",
          senderMac: "02:00:00:20:00:01",
        },
        {
          i: 1,
          t: 1,
          proto: "arp",
          op: "reply",
          unsolicited: true,
          senderIp: "10.20.0.1",
          senderMac: "02:00:00:20:00:66",
        },
      ],
      DEFAULT_RULES,
    );
    expect(alerts.map((a) => a.rule)).toEqual(["arp-unsolicited", "arp-flip"]);
  });
});
