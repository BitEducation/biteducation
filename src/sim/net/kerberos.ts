/**
 * Kerberos in three exchanges (AS, TGS, service), tracked as which key seals each piece and who
 * can open it. The password only derives the client's long-term key; it never crosses the network.
 * Authenticators carry a timestamp the receiver accepts within a fixed clock skew.
 */

export const MAX_SKEW_MIN = 5;
export const TGT_HOURS = 10;

export interface KMsg {
  n: number;
  from: string;
  to: string;
  what: string;
  sealed: string;
  opens: string;
}

export function kerberosRun(skewMin: number, rightPassword: boolean, services: number) {
  const msgs: KMsg[] = [
    {
      n: 1,
      from: "cliente",
      to: "as",
      what: "AS-REQ: sou ana, quero um TGT",
      sealed: "nada",
      opens: "todos",
    },
    {
      n: 2,
      from: "as",
      to: "cliente",
      what: "AS-REP: {K1}Kana + TGT={ana, K1, validade}Ktgs",
      sealed: "Kana e Ktgs",
      opens: "ana abre K1; só o TGS abre o TGT",
    },
    {
      n: 3,
      from: "cliente",
      to: "tgs",
      what: "TGS-REQ: TGT + {ana, hora}K1, quero arquivos",
      sealed: "Ktgs e K1",
      opens: "TGS",
    },
    {
      n: 4,
      from: "tgs",
      to: "cliente",
      what: "TGS-REP: {K2}K1 + bilhete={ana, K2}Karq",
      sealed: "K1 e Karq",
      opens: "ana abre K2; só arquivos abre o bilhete",
    },
    {
      n: 5,
      from: "cliente",
      to: "srv",
      what: "AP-REQ: bilhete + {ana, hora}K2",
      sealed: "Karq e K2",
      opens: "servidor de arquivos",
    },
    { n: 6, from: "srv", to: "cliente", what: "AP-REP: {hora}K2", sealed: "K2", opens: "ana" },
  ];
  const gotTgt = rightPassword;
  const accepted = gotTgt && Math.abs(skewMin) <= MAX_SKEW_MIN;
  // First service: 6 messages; each further one skips AS: 4 messages.
  const total = services <= 0 ? 0 : 6 + 4 * (services - 1);
  return { msgs, gotTgt, accepted, total, passwordTyped: 1 };
}
