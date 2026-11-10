/**
 * SYN flood against a listen backlog, with optional SYN cookies (RFC 4987 §3.6).
 * Discrete ticks (1 tick = 1 s). Spoofed SYNs never complete; each half-open entry expires
 * after `synTimeout` ticks. With cookies, a SYN that finds the backlog full gets a SYN-ACK whose
 * ISN encodes the state, and nothing is stored.
 */
export interface FloodCfg {
  ticks: number;
  backlog: number;
  /** Spoofed SYNs per tick while the attack runs. */
  rate: number;
  attackFrom: number;
  attackTo: number;
  synTimeout: number;
  cookies: boolean;
  /** Ticks when the legitimate client (Lia) sends a SYN. */
  legit: number[];
}

export type FloodEv =
  | { t: number; kind: "syn"; who: "atk" | "lia"; result: "queued" | "dropped" | "cookie"; halfOpen: number }
  | { t: number; kind: "expire"; count: number; halfOpen: number }
  | { t: number; kind: "established"; who: "lia"; via: "backlog" | "cookie"; halfOpen: number };

export interface FloodResult {
  events: FloodEv[];
  /** Half-open count at the end of each tick. */
  series: number[];
  dropped: number;
  cookiesSent: number;
  liaOk: number;
  liaRefused: number;
  maxHalfOpen: number;
}

export function runFlood(cfg: FloodCfg): FloodResult {
  if (cfg.ticks > 120 || cfg.rate > 500 || cfg.backlog > 1024) throw new Error("Parâmetros fora do limite");
  const events: FloodEv[] = [];
  const series: number[] = [];
  // each entry: tick it expires; Lia's entry completes next tick
  let entries: { expires: number; lia: boolean }[] = [];
  const res = { dropped: 0, cookiesSent: 0, liaOk: 0, liaRefused: 0, maxHalfOpen: 0 };
  const pendingLia: { at: number; via: "backlog" | "cookie" }[] = [];
  for (let t = 0; t < cfg.ticks; t++) {
    const before = entries.length;
    entries = entries.filter((e) => e.expires > t);
    if (entries.length < before)
      events.push({ t, kind: "expire", count: before - entries.length, halfOpen: entries.length });
    for (const p of pendingLia.filter((x) => x.at === t)) {
      if (p.via === "backlog") {
        const i = entries.findIndex((e) => e.lia);
        if (i >= 0) entries.splice(i, 1);
      }
      res.liaOk++;
      events.push({ t, kind: "established", who: "lia", via: p.via, halfOpen: entries.length });
    }
    const arrive = (who: "atk" | "lia") => {
      let result: "queued" | "dropped" | "cookie";
      if (entries.length < cfg.backlog) {
        entries.push({ expires: t + cfg.synTimeout, lia: who === "lia" });
        result = "queued";
      } else if (cfg.cookies) {
        res.cookiesSent++;
        result = "cookie";
      } else {
        res.dropped++;
        result = "dropped";
      }
      events.push({ t, kind: "syn", who, result, halfOpen: entries.length });
      if (who === "lia") {
        if (result === "dropped") res.liaRefused++;
        else pendingLia.push({ at: t + 1, via: result === "cookie" ? "cookie" : "backlog" });
      }
    };
    if (t >= cfg.attackFrom && t < cfg.attackTo) for (let k = 0; k < cfg.rate; k++) arrive("atk");
    if (cfg.legit.includes(t)) arrive("lia");
    res.maxHalfOpen = Math.max(res.maxHalfOpen, entries.length);
    series.push(entries.length);
  }
  return { events, series, ...res };
}

/** FNV-1a, 32 bits. Didactic stand-in for the keyed hash (SipHash in Linux) of real SYN cookies. */
function fnv1a(bytes: readonly number[]): number {
  let h = 0x811c9dc5;
  for (const b of bytes) {
    h ^= b & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export const MSS_TABLE = [536, 1300, 1440, 1460] as const;

/**
 * Classic SYN cookie layout (D. J. Bernstein): 5 bits of a slow counter t, 3 bits for the MSS
 * index and 24 bits of a hash over the connection 4-tuple, t and a server secret.
 */
export function synCookie(tuple: readonly number[], t: number, mss: number, secret: number) {
  const mssIdx = Math.max(
    0,
    MSS_TABLE.findLastIndex((m) => m <= mss),
  );
  const hash =
    fnv1a([
      ...tuple,
      t & 0xff,
      (secret >>> 24) & 0xff,
      (secret >>> 16) & 0xff,
      (secret >>> 8) & 0xff,
      secret & 0xff,
    ]) & 0xffffff;
  const isn = (((t & 31) << 27) | (mssIdx << 24) | hash) >>> 0;
  return { isn, t: t & 31, mssIdx, mss: MSS_TABLE[mssIdx] as number, hash };
}

export function checkCookie(isn: number, tuple: readonly number[], now: number, secret: number): boolean {
  const t = isn >>> 27;
  if (((now & 31) - t + 32) % 32 > 1) return false;
  const mssIdx = (isn >>> 24) & 7;
  const mss = MSS_TABLE[mssIdx];
  if (mss === undefined) return false;
  return synCookie(tuple, t, mss, secret).isn === isn >>> 0;
}
