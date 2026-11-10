import { ip4, type Layer, layerBuilder, u8, u16, u32 } from "./bytes.ts";
import { ip6 } from "./ipv6.ts";

/** DNS messages (RFC 1035), with the record types the lessons use. */
export const QTYPE = {
  A: 1,
  NS: 2,
  CNAME: 5,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  OPT: 41,
  DS: 43,
  RRSIG: 46,
  DNSKEY: 48,
} as const;
export type QType = keyof typeof QTYPE;

export function name(n: string): number[] {
  if (n === "." || n === "") return [0];
  return [
    ...n
      .replace(/\.$/, "")
      .split(".")
      .flatMap((l) => {
        if (l.length > 63) throw new Error("Rótulo DNS longo demais");
        return [l.length, ...[...l].map((c) => c.charCodeAt(0))];
      }),
    0,
  ];
}

export interface Rr {
  name: string;
  type: QType;
  ttl: number;
  /** A/AAAA: address; NS/CNAME: name; MX: "10 mx.example"; TXT: text; others: raw bytes. */
  data: string | (number | null)[];
  /** Short text for the inspector when data is raw. */
  show?: string;
  note?: string;
}

function rdata(r: Rr): (number | null)[] {
  if (Array.isArray(r.data)) return r.data;
  switch (r.type) {
    case "A":
      return ip4(r.data);
    case "AAAA":
      return ip6(r.data);
    case "NS":
    case "CNAME":
      return name(r.data);
    case "MX": {
      const [pref, host = ""] = r.data.split(" ");
      return [...u16(Number(pref)), ...name(host)];
    }
    case "TXT":
      return [r.data.length, ...[...r.data].map((c) => c.charCodeAt(0))];
    default:
      throw new Error(`rdata de ${r.type} precisa ser bytes`);
  }
}

export interface DnsMsg {
  id: number;
  response: boolean;
  /** Recursion desired / available, authoritative answer, authentic data (DNSSEC). */
  rd?: boolean;
  ra?: boolean;
  aa?: boolean;
  ad?: boolean;
  rcode?: number;
  question: { name: string; type: QType };
  answers?: Rr[];
  authority?: Rr[];
  additional?: Rr[];
  /** Adds an EDNS(0) OPT record; `dnssecOk` sets the DO bit. */
  edns?: { size: number; dnssecOk?: boolean };
}

const RCODE: Record<number, string> = {
  0: "0 (sem erro)",
  2: "2 (falha no servidor)",
  3: "3 (nome não existe)",
};

const RR_NOTE: Record<string, string> = {
  A: "Endereço IPv4 do nome; o TTL diz por quantos segundos pode ficar no cache",
  AAAA: "Endereço IPv6 do nome; o TTL diz por quantos segundos pode ficar no cache",
  NS: "Servidor que manda nesta zona: a busca continua nele",
  CNAME: "Apelido: o nome verdadeiro é outro, e a busca segue por ele",
  MX: "Servidor que recebe e-mail para este domínio, com prioridade",
  TXT: "Texto livre; usado para SPF, DMARC e provas de domínio",
  SOA: "Dados da zona: servidor principal, contato e tempos de cache",
  DS: "Resumo da chave da zona filha, publicado pela zona mãe: o elo da cadeia DNSSEC",
  DNSKEY: "Chave pública da zona, usada para conferir as assinaturas",
  RRSIG: "Assinatura de um conjunto de registros",
};

export function dns(m: DnsMsg, id = "dns", label = "DNS"): Layer {
  const b = layerBuilder(id, label, "s4");
  const an = m.answers ?? [];
  const ns = m.authority ?? [];
  const ar = m.additional ?? [];
  b.field("Identificador", `0x${m.id.toString(16).padStart(4, "0")}`, u16(m.id), {
    note: "A resposta precisa repetir este número: é o que liga resposta a pergunta",
  });
  const flags =
    (m.response ? 0x8000 : 0) |
    (m.aa ? 0x0400 : 0) |
    (m.rd ? 0x0100 : 0) |
    (m.ra ? 0x0080 : 0) |
    (m.ad ? 0x0020 : 0) |
    (m.rcode ?? 0);
  const on = [
    m.response ? "resposta" : "pergunta",
    m.aa ? "autoritativa" : "",
    m.rd ? "recursão pedida" : "",
    m.ra ? "recursão disponível" : "",
    m.ad ? "AD (validada)" : "",
  ].filter(Boolean);
  b.field("Flags", on.join(", "), u16(flags), {
    note: m.response
      ? "Bits de estado: se é resposta, se veio de quem manda na zona e se a recursão foi feita"
      : "Bits de estado; com recursão pedida, o resolvedor vai atrás da resposta completa",
    children: [
      {
        label: "Código de resposta",
        value: RCODE[m.rcode ?? 0] ?? String(m.rcode),
        note: "Zero é sucesso; NXDOMAIN quer dizer que o nome não existe",
      },
    ],
  });
  b.field("Perguntas", "1", u16(1), { note: "Na prática sempre uma pergunta por mensagem" });
  b.field("Respostas", String(an.length), u16(an.length), { note: "Registros que respondem à pergunta" });
  b.field("Autoridade", String(ns.length), u16(ns.length), {
    note: "Registros que apontam quem manda na zona, para continuar a busca",
  });
  b.field("Adicionais", String(ar.length + (m.edns ? 1 : 0)), u16(ar.length + (m.edns ? 1 : 0)), {
    note: "Extras que poupam uma consulta, como o IP dos servidores citados, e a opção EDNS",
  });
  b.field(
    "Pergunta",
    `${m.question.name} ${m.question.type}`,
    [...name(m.question.name), ...u16(QTYPE[m.question.type]), ...u16(1)],
    { note: "O nome, em pedaços com tamanho na frente, mais o tipo de registro pedido e a classe IN" },
  );
  const rr = (sect: string, r: Rr) => {
    const d = rdata(r);
    const shown = r.show ?? (Array.isArray(r.data) ? `${d.length} bytes` : r.data);
    b.field(
      `${sect}: ${r.type}`,
      `${r.name} → ${shown} (TTL ${r.ttl} s)`,
      [...name(r.name), ...u16(QTYPE[r.type]), ...u16(1), ...u32(r.ttl), ...u16(d.length), ...d],
      { note: r.note ?? RR_NOTE[r.type] ?? "Um registro: nome, tipo, validade no cache (TTL) e dado" },
    );
  };
  for (const r of an) rr("Resposta", r);
  for (const r of ns) rr("Autoridade", r);
  for (const r of ar) rr("Adicional", r);
  if (m.edns)
    b.field(
      "Adicional: OPT (EDNS)",
      `até ${m.edns.size} bytes por UDP${m.edns.dnssecOk ? ", DO=1 (quero assinaturas)" : ""}`,
      [
        0,
        ...u16(QTYPE.OPT),
        ...u16(m.edns.size),
        ...u8(0),
        ...u8(0),
        ...u16(m.edns.dnssecOk ? 0x8000 : 0),
        ...u16(0),
      ],
      { note: "Pseudo-registro EDNS: aceita respostas UDP maiores que os 512 bytes originais" },
    );
  return b.done();
}
