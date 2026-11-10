import { hexN, type Layer, layerBuilder, mac, u16 } from "./bytes.ts";

/** Ethernet II header (IEEE 802.3, DIX framing), without preamble and FCS, as a capture shows it. */
export const ETHERTYPE = { ipv4: 0x0800, arp: 0x0806, ipv6: 0x86dd } as const;

const TYPE_NAME: Record<number, string> = { 2048: "IPv4", 2054: "ARP", 34525: "IPv6" };

export function ethernet(
  dst: string,
  src: string,
  type: number,
  names: { dst?: string; src?: string } = {},
): Layer {
  const b = layerBuilder("eth", "Ethernet II", "s3");
  b.field(
    "MAC de destino",
    `${dst}${names.dst ? ` (${names.dst})` : ""}`,
    mac(dst),
    dst === "ff:ff:ff:ff:ff:ff" ? { note: "Broadcast: todos da LAN recebem" } : {},
  );
  b.field("MAC de origem", `${src}${names.src ? ` (${names.src})` : ""}`, mac(src));
  b.field("EtherType", `${hexN(type, 4)} (${TYPE_NAME[type] ?? "?"})`, u16(type), {
    note: "Diz qual protocolo vem dentro do quadro",
  });
  return b.done();
}
