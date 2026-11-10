/**
 * A stack frame with an 8-byte buffer, a canary word, the saved frame pointer and the return
 * address, in 4-byte words. An unchecked copy of `len` bytes overwrites the words in order;
 * what happens at the function's return depends on what was hit and on the canary check.
 * Only the consequence is modelled, never what an attacker would write.
 */

export const WORD = 4;
export const BUF = 8;
export const FRAME = ["buf[0..3]", "buf[4..7]", "canário", "quadro anterior", "endereço de retorno"] as const;

export type Outcome = "ok" | "latente" | "abortado" | "quebra" | "desvio";

export function overflowRun(len: number, canary: boolean) {
  const n = Math.min(24, Math.max(1, len));
  const touched = Math.ceil(n / WORD);
  const hit = FRAME.map((_, i) => i < touched);
  const over = Math.max(0, n - BUF);
  let outcome: Outcome = "ok";
  if (n > BUF) {
    if (canary) outcome = "abortado";
    else if (hit[4]) outcome = "desvio";
    else if (hit[3]) outcome = "quebra";
    else outcome = "latente";
  }
  return {
    len: n,
    touched: Math.min(touched, FRAME.length),
    hit,
    over,
    outcome,
    beyondFrame: n > FRAME.length * WORD,
  };
}
