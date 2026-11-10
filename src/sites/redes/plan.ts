/**
 * Address and name plan of the redes site. Documentation ranges only
 * (RFC 1918, RFC 5737, RFC 2606); MACs are locally administered (second hex digit 2).
 */
export const LIA = {
  name: "notebook da Lia",
  ip: "10.20.0.42",
  mac: "02:00:00:20:00:42",
  port: 51034,
} as const;
export const GW = {
  name: "roteador do campus",
  ip: "10.20.0.1",
  mac: "02:00:00:20:00:01",
  wanIp: "198.51.100.7",
  wanMac: "02:00:00:33:00:07",
} as const;
export const ISP = {
  name: "roteador do provedor",
  ip: "198.51.100.1",
  mac: "02:00:00:33:00:01",
  farMac: "02:00:00:c0:02:01",
} as const;
export const DAVI = {
  name: "servidor da biblioteca",
  ip: "192.0.2.10",
  mac: "02:00:00:c0:02:0a",
  host: "biblioteca.campus.example",
} as const;
export const MALU = {
  name: "notebook da Malu",
  ip: "10.20.0.66",
  mac: "02:00:00:20:00:66",
  wanIp: "203.0.113.66",
} as const;
export const BROADCAST = "ff:ff:ff:ff:ff:ff";
export const ZERO_MAC = "00:00:00:00:00:00";

/** The page Lia asks for in encapsulamento (plain HTTP) and tls13 (inside TLS): same bytes. */
export const PAGE_PATH = "/horarios";
export const PAGE_REQUEST = `GET ${PAGE_PATH} HTTP/1.1\r\nHost: ${DAVI.host}\r\nUser-Agent: navegador-didatico\r\nAccept: text/html\r\n\r\n`;

/** Campus services and the DNS hierarchy used by the name-resolution lessons. */
export const RESOLVER = { name: "resolvedor do campus", ip: "10.20.0.53" } as const;
export const ROOT_NS = { name: "servidor raiz", host: "a.root.example", ip: "198.51.100.53" } as const;
export const TLD_NS = { name: "servidor do .example", host: "ns.tld.example", ip: "203.0.113.53" } as const;
export const AUTH_NS = {
  name: "servidor autoritativo",
  host: "ns1.campus.example",
  ip: "192.0.2.53",
} as const;

/** IPv6 plan: documentation prefix (RFC 3849). */
export const V6 = {
  prefix: "2001:db8:20::",
  routerLL: "fe80::1",
  routerMac: "02:00:00:20:00:01",
  server: "2001:db8:c0::10",
} as const;

/** Mail lessons: the campus mail server, the destination institution and Ana, who reads the mail. */
export const MAIL_CAMPUS = { ip: "192.0.2.25", host: "smtp.campus.example", port: 50612 } as const;
export const MAIL_DEST = { ip: "203.0.113.25", host: "mx.pesquisa.example" } as const;
export const ANA = { ip: "203.0.113.77", port: 52144 } as const;
export const MAIL = [
  "From: Lia <lia@campus.example>",
  "To: Ana <ana@pesquisa.example>",
  "Subject: Horario da monitoria",
  "",
  "Oi, Ana! A monitoria de redes vai ser na biblioteca, sala 3.",
  "",
].join("\r\n");
