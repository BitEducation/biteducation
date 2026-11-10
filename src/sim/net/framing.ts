/**
 * Framing (CN 3.1.2): where a frame starts and ends. PPP byte stuffing (RFC 1662) escapes the
 * flag 0x7E and the escape 0x7D as 0x7D, byte XOR 0x20; HDLC bit stuffing inserts a 0 after
 * every five consecutive 1s so the flag 01111110 never appears inside the data.
 */
export const FLAG = 0x7e;
export const ESC = 0x7d;

export function byteStuff(data: number[]): number[] {
  const out: number[] = [];
  for (const x of data) {
    if (x === FLAG || x === ESC) out.push(ESC, x ^ 0x20);
    else out.push(x);
  }
  return out;
}

export function byteUnstuff(body: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < body.length; i++) {
    const x = body[i] as number;
    if (x === ESC) out.push((body[++i] as number) ^ 0x20);
    else out.push(x);
  }
  return out;
}

/** Returns the stuffed bits and the positions (in the output) of the inserted zeros. */
export function bitStuff(bits: string): { out: string; inserted: number[] } {
  let out = "";
  let ones = 0;
  const inserted: number[] = [];
  for (const b of bits) {
    out += b;
    ones = b === "1" ? ones + 1 : 0;
    if (ones === 5) {
      inserted.push(out.length);
      out += "0";
      ones = 0;
    }
  }
  return { out, inserted };
}

export function bitUnstuff(bits: string): string {
  let out = "";
  let ones = 0;
  for (let i = 0; i < bits.length; i++) {
    const b = bits[i] as string;
    out += b;
    ones = b === "1" ? ones + 1 : 0;
    if (ones === 5) {
      i++;
      ones = 0;
    }
  }
  return out;
}

export const hex = (xs: number[]) => xs.map((x) => x.toString(16).toUpperCase().padStart(2, "0")).join(" ");

/**
 * Byte-count framing: each frame starts with its own length (count byte included). Returns the
 * frames the receiver cuts, stopping when a count is impossible (sync is lost for good).
 */
export function cutByCount(stream: number[]): { frames: number[][]; lost: boolean } {
  const frames: number[][] = [];
  let i = 0;
  while (i < stream.length) {
    const n = stream[i] as number;
    if (n < 2 || i + n > stream.length) return { frames, lost: true };
    frames.push(stream.slice(i, i + n));
    i += n;
  }
  return { frames, lost: false };
}

/** Parses "41 7E 42" into bytes. */
export const parseHex = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => Number.parseInt(x, 16) & 255);
