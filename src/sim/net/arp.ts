import { ip4, type Layer, layerBuilder, mac, u8, u16 } from "./bytes.ts";

/** ARP for IPv4 over Ethernet (RFC 826). 28 bytes. */
export interface ArpMsg {
  op: "request" | "reply";
  senderMac: string;
  senderIp: string;
  targetMac: string;
  targetIp: string;
}

export function arp(m: ArpMsg, forged = false): Layer {
  const b = layerBuilder("arp", "ARP", forged ? "bad" : "b");
  b.field("Tipo de hardware", "1 (Ethernet)", u16(1));
  b.field("Tipo de protocolo", "0x0800 (IPv4)", u16(0x0800));
  b.field("Tamanho do endereço de hardware", "6", u8(6));
  b.field("Tamanho do endereço de protocolo", "4", u8(4));
  b.field("Operação", m.op === "request" ? "1 (pedido)" : "2 (resposta)", u16(m.op === "request" ? 1 : 2));
  b.field(
    "MAC do remetente",
    m.senderMac,
    mac(m.senderMac),
    forged ? { note: "Mentira: este MAC não é de quem tem o IP abaixo" } : {},
  );
  b.field("IP do remetente", m.senderIp, ip4(m.senderIp));
  b.field(
    "MAC do alvo",
    m.targetMac,
    mac(m.targetMac),
    m.op === "request" ? { note: "Zerado: é justamente o que se quer descobrir" } : {},
  );
  b.field("IP do alvo", m.targetIp, ip4(m.targetIp));
  return b.done();
}
