import { hexN, ip4, type Layer, layerBuilder, mac, u8, u16, u32 } from "./bytes.ts";

/** DHCPv4 (RFC 2131) over the BOOTP layout, with the options from RFC 2132. */
export type DhcpType = "DISCOVER" | "OFFER" | "REQUEST" | "ACK" | "NAK" | "RELEASE";
const TYPE: Record<DhcpType, number> = { DISCOVER: 1, OFFER: 2, REQUEST: 3, ACK: 5, NAK: 6, RELEASE: 7 };

export interface DhcpMsg {
  type: DhcpType;
  xid: number;
  clientMac: string;
  /** "your" address: the one being offered or confirmed. */
  yiaddr?: string;
  ciaddr?: string;
  broadcast?: boolean;
  requested?: string;
  serverId?: string;
  lease?: number;
  mask?: string;
  router?: string;
  dns?: string[];
  hostname?: string;
  paramList?: number[];
}

const ZERO = "0.0.0.0";

export function dhcp(m: DhcpMsg): Layer {
  const reply = m.type === "OFFER" || m.type === "ACK" || m.type === "NAK";
  const b = layerBuilder("dhcp", "DHCP", "s4");
  b.field("Operação", reply ? "2 (resposta do servidor)" : "1 (pedido do cliente)", u8(reply ? 2 : 1));
  b.field("Hardware", "1 (Ethernet), 6 bytes, 0 saltos", [1, 6, 0]);
  b.field("Transação (xid)", hexN(m.xid, 8), u32(m.xid), {
    note: "Número aleatório do cliente; as respostas repetem para ele reconhecer as suas",
  });
  b.field("Segundos", "0", u16(0));
  b.field("Flags", m.broadcast ? "broadcast" : "nenhuma", u16(m.broadcast ? 0x8000 : 0), {
    note: "Broadcast: o cliente ainda não tem IP e pede a resposta para todos",
  });
  b.field("ciaddr (IP atual do cliente)", m.ciaddr ?? ZERO, ip4(m.ciaddr ?? ZERO));
  b.field(
    "yiaddr (seu IP)",
    m.yiaddr ?? ZERO,
    ip4(m.yiaddr ?? ZERO),
    m.yiaddr ? { note: "O endereço oferecido ou confirmado" } : {},
  );
  b.field("siaddr e giaddr", `${ZERO}, ${ZERO}`, [...ip4(ZERO), ...ip4(ZERO)], {
    note: "giaddr seria o relay, quando o servidor fica em outra rede",
  });
  b.field("chaddr (MAC do cliente)", m.clientMac, [...mac(m.clientMac), ...Array(10).fill(0)]);
  b.field("sname e file", "vazios (192 bytes)", Array(192).fill(0), { note: "Herança do BOOTP" });
  b.field("Magic cookie", "99.130.83.99", [99, 130, 83, 99], { note: "Daqui em diante vêm as opções DHCP" });
  b.field("Opção 53: tipo", `${TYPE[m.type]} (${m.type})`, [53, 1, TYPE[m.type]]);
  if (m.requested) b.field("Opção 50: IP pedido", m.requested, [50, 4, ...ip4(m.requested)]);
  if (m.serverId)
    b.field("Opção 54: servidor", m.serverId, [54, 4, ...ip4(m.serverId)], {
      note: "No REQUEST, diz qual das ofertas o cliente aceitou",
    });
  if (m.lease !== undefined) b.field("Opção 51: concessão", `${m.lease} s`, [51, 4, ...u32(m.lease)]);
  if (m.mask) b.field("Opção 1: máscara", m.mask, [1, 4, ...ip4(m.mask)]);
  if (m.router) b.field("Opção 3: roteador", m.router, [3, 4, ...ip4(m.router)]);
  if (m.dns?.length)
    b.field("Opção 6: DNS", m.dns.join(", "), [6, 4 * m.dns.length, ...m.dns.flatMap((d) => ip4(d))]);
  if (m.hostname)
    b.field("Opção 12: nome", m.hostname, [
      12,
      m.hostname.length,
      ...[...m.hostname].map((c) => c.charCodeAt(0)),
    ]);
  if (m.paramList?.length)
    b.field("Opção 55: lista de pedidos", m.paramList.join(", "), [55, m.paramList.length, ...m.paramList], {
      note: "1 máscara, 3 roteador, 6 DNS, 15 domínio, 42 NTP",
    });
  b.field("Fim", "255", [255]);
  return b.done();
}
