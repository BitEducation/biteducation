import type { FieldNode } from "../../contracts/types.ts";

/** Well-known ports the lessons use, for the inspector notes. */
const WELL_KNOWN: Record<number, string> = {
  20: "FTP (dados)",
  21: "FTP (controle)",
  22: "SSH",
  23: "Telnet",
  25: "SMTP, entre servidores de e-mail",
  53: "DNS",
  67: "DHCP, lado do servidor",
  68: "DHCP, lado do cliente",
  80: "HTTP",
  110: "POP3",
  123: "NTP",
  143: "IMAP",
  161: "SNMP",
  389: "LDAP",
  443: "HTTPS",
  465: "SMTP com TLS direto",
  500: "IKE (IPsec)",
  587: "SMTP de envio, do cliente ao servidor",
  853: "DNS sobre TLS",
  993: "IMAP com TLS",
  995: "POP3 com TLS",
  1812: "RADIUS",
  3478: "STUN",
  4500: "IKE atrás de NAT",
  5060: "SIP",
  8080: "HTTP alternativo, comum em proxies",
  51820: "WireGuard",
};

/**
 * Note for a TCP or UDP port: the service behind a well-known one, or an ephemeral port.
 * Ephemeral ports change on every real connection, so they are flagged as example values.
 */
export function portNote(port: number): Pick<FieldNode, "note" | "example"> {
  const svc = WELL_KNOWN[port];
  if (svc) return { note: `Porta conhecida: ${svc}` };
  if (port >= 32768)
    return {
      note: "Porta efêmera: o sistema escolhe uma livre para esta conversa e a resposta volta para ela",
      example: true,
    };
  return {};
}
