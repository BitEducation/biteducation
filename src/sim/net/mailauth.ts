import { base64, sha1, textBytes } from "../shared/hash.ts";

/**
 * Sender authentication for e-mail, evaluated like a receiving server would: SPF checks the
 * connecting IP against the envelope domain's record, DKIM checks a signature over a body hash,
 * and DMARC requires one of them to pass for a domain aligned with the visible From.
 * Domains are RFC 2606 examples and IPs are documentation ranges.
 */

export type Verdict = "pass" | "fail" | "none";
export type Policy = "none" | "quarantine" | "reject";

export const SPF: Record<string, string[]> = {
  "banco.example": ["192.0.2."],
  "golpe.example": ["203.0.113."],
};

export interface Mail {
  id: string;
  label: string;
  ip: string;
  mailFrom: string;
  from: string;
  dkimDomain: string | null;
  signedBody: string;
  body: string;
}

export const bodyHash = (body: string) => base64(sha1(textBytes(body))).slice(0, 12);

export function spf(m: Mail): Verdict {
  const allowed = SPF[m.mailFrom];
  if (!allowed) return "none";
  return allowed.some((pre) => m.ip.startsWith(pre)) ? "pass" : "fail";
}

export function dkim(m: Mail): Verdict {
  if (!m.dkimDomain) return "none";
  // The signature covers the body hash; any change to the body breaks it.
  return bodyHash(m.body) === bodyHash(m.signedBody) ? "pass" : "fail";
}

export function dmarc(m: Mail, policy: Policy) {
  const s = spf(m);
  const d = dkim(m);
  const spfAligned = s === "pass" && m.mailFrom === m.from;
  const dkimAligned = d === "pass" && m.dkimDomain === m.from;
  const ok = spfAligned || dkimAligned;
  const action = ok
    ? "entregar"
    : policy === "reject"
      ? "rejeitar"
      : policy === "quarantine"
        ? "quarentena"
        : "entregar";
  return { spf: s, dkim: d, spfAligned, dkimAligned, ok, action };
}

const BODY = "Sua fatura de novembro está disponível no aplicativo.";
const FOOTER = "\n-- Lista de clientes: para sair, responda SAIR.";

export function mails(footer: boolean): Mail[] {
  return [
    {
      id: "m1",
      label: "fatura do banco",
      ip: "192.0.2.10",
      mailFrom: "banco.example",
      from: "banco.example",
      dkimDomain: "banco.example",
      signedBody: BODY,
      body: BODY,
    },
    {
      id: "m2",
      label: "falsa, se passando pelo banco",
      ip: "203.0.113.66",
      mailFrom: "golpe.example",
      from: "banco.example",
      dkimDomain: null,
      signedBody: "",
      body: "Sua conta será bloqueada. Confirme seus dados.",
    },
    {
      id: "m3",
      label: "fatura reenviada por uma lista",
      ip: "198.51.100.5",
      mailFrom: "banco.example",
      from: "banco.example",
      dkimDomain: "banco.example",
      signedBody: BODY,
      body: footer ? BODY + FOOTER : BODY,
    },
  ];
}
