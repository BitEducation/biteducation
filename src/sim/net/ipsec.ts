/**
 * IPsec ESP (RFC 4303) sizes with AES-GCM (8-byte IV, 16-byte ICV) in tunnel and transport mode,
 * and the receiver's sliding anti-replay window.
 */

export const IP = 20;
export const ESP_HDR = 8;
export const IV = 8;
export const ICV = 16;

export interface EspSize {
  outerIp: number;
  esp: number;
  iv: number;
  payload: number;
  pad: number;
  trailer: number;
  icv: number;
  total: number;
}

/** The encrypted part (payload + padding + 2-byte trailer) must end on a 4-byte boundary. */
export function espSize(packet: number, mode: "tunnel" | "transport"): EspSize {
  const payload = mode === "tunnel" ? packet : packet - IP;
  const pad = (4 - ((payload + 2) % 4)) % 4;
  const total = IP + ESP_HDR + IV + payload + pad + 2 + ICV;
  return { outerIp: IP, esp: ESP_HDR, iv: IV, payload, pad, trailer: 2, icv: ICV, total };
}

export type Verdict = "aceito" | "repetido" | "velho demais";

/** Window of `size` sequence numbers ending at the highest seen. */
export function antiReplay(seqs: number[], size: number): { seq: number; verdict: Verdict; top: number }[] {
  let top = 0;
  const seen = new Set<number>();
  return seqs.map((seq) => {
    let verdict: Verdict;
    if (seq + size <= top) verdict = "velho demais";
    else if (seen.has(seq)) verdict = "repetido";
    else {
      verdict = "aceito";
      seen.add(seq);
      top = Math.max(top, seq);
    }
    return { seq, verdict, top };
  });
}
