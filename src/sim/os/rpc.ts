/**
 * Remote procedure call (MOS 8.2.4; CN 6.4.2): the client stub marshals the call into
 * big-endian bytes; a lost reply makes the client retry, and the server's reply cache decides
 * whether the procedure runs once or twice.
 */

export interface Call {
  proc: number;
  args: number[];
}

/** Procedure number then each argument, all as 32-bit big-endian integers (XDR style). */
export function marshal(c: Call): number[] {
  const out: number[] = [];
  for (const v of [c.proc, ...c.args]) out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
  return out;
}

export function unmarshal(bytes: number[]): Call {
  const words: number[] = [];
  for (let i = 0; i + 3 < bytes.length; i += 4)
    words.push(
      (((bytes[i] as number) << 24) |
        ((bytes[i + 1] as number) << 16) |
        ((bytes[i + 2] as number) << 8) |
        (bytes[i + 3] as number)) >>>
        0,
    );
  return { proc: words[0] ?? 0, args: words.slice(1) };
}

export const hex = (bytes: number[]) => bytes.map((x) => x.toString(16).padStart(2, "0")).join(" ");

/** Cost of one call, in microseconds. */
export interface Costs {
  local: number;
  marshal: number;
  rtt: number;
  server: number;
}

export const remoteCost = (k: Costs) => 2 * k.marshal + k.rtt + k.server;

export interface Attempt {
  attempt: number;
  executed: boolean;
  replyLost: boolean;
  balance: number;
}

/**
 * A deposit whose first reply is lost; the client retries once. "at-least-once" re-executes,
 * "at-most-once" answers from the cache of request ids it has already run.
 */
export function deposit(
  sem: "at-least-once" | "at-most-once",
  start: number,
  amount: number,
  lost: number[],
): Attempt[] {
  const seen = new Set<number>();
  let balance = start;
  const out: Attempt[] = [];
  const reqId = 1;
  for (let a = 1; a <= lost.length + 1; a++) {
    const dup = sem === "at-most-once" && seen.has(reqId);
    if (!dup) balance += amount;
    seen.add(reqId);
    const replyLost = lost.includes(a);
    out.push({ attempt: a, executed: !dup, replyLost, balance });
    if (!replyLost) break;
  }
  return out;
}
