import type { Frame } from "../../contracts/types.ts";
import { ascii, frameOf, type Layer } from "../../sim/net/bytes.ts";
import { ETHERTYPE, ethernet } from "../../sim/net/ethernet.ts";
import { ipv4, PROTO } from "../../sim/net/ipv4.ts";
import { payloadLayer, type TcpFlag, tcp } from "../../sim/net/tcp.ts";
import { udp } from "../../sim/net/udp.ts";

/** Frame builders shared by the redes lessons: IPv4 + UDP/TCP + an application layer. */
export interface Ends {
  src: string;
  dst: string;
  sport: number;
  dport: number;
  ttl?: number;
  ipId?: number;
}

export function udpFrame(
  e: Ends,
  app: Layer | null,
  t: {
    id: string;
    title: string;
    summary: string;
    where?: string;
    names?: { sport?: string; dport?: string };
    eth?: { dst: string; src: string; names?: { dst?: string; src?: string } };
  },
): Frame {
  const payload = (app?.bytes ?? []).map((x) => x ?? 0);
  const u = udp({
    src: e.src,
    dst: e.dst,
    sport: e.sport,
    dport: e.dport,
    payload,
    ...(t.names ? { names: t.names } : {}),
  });
  const ip = ipv4({
    src: e.src,
    dst: e.dst,
    proto: PROTO.udp,
    payloadLen: 8 + payload.length,
    ttl: e.ttl ?? 64,
    id: e.ipId ?? 0,
    df: false,
  });
  const eth = t.eth ? [ethernet(t.eth.dst, t.eth.src, ETHERTYPE.ipv4, t.eth.names ?? {})] : [];
  return frameOf(t.id, t.title, t.summary, [...eth, ip, u, ...(app ? [app] : [])], t.where);
}

export interface TcpSeg extends Ends {
  seq: number;
  ack: number;
  flags: TcpFlag[];
  window?: number;
  mss?: number;
}

export function tcpFrame(
  s: TcpSeg,
  app: Layer | null,
  t: { id: string; title: string; summary: string; where?: string },
): Frame {
  const payload = (app?.bytes ?? []).map((x) => x ?? 0);
  const seg = tcp({
    srcIp: s.src,
    dstIp: s.dst,
    sport: s.sport,
    dport: s.dport,
    seq: s.seq,
    ack: s.ack,
    flags: s.flags,
    window: s.window ?? 64240,
    ...(s.mss ? { mss: s.mss } : {}),
    payload,
  });
  const ip = ipv4({
    src: s.src,
    dst: s.dst,
    proto: PROTO.tcp,
    payloadLen: seg.bytes.length + payload.length,
    ttl: s.ttl ?? 64,
    id: s.ipId ?? 0,
  });
  return frameOf(t.id, t.title, t.summary, app ? [ip, seg, app] : [ip, seg], t.where);
}

/** Text protocol message (HTTP, SMTP, FTP…) as a layer with one field per line. */
export function textLayer(
  id: string,
  label: string,
  text: string,
  notes: Record<number, string> = {},
): Layer {
  const bytes = ascii(text);
  const lines = text.split("\r\n");
  const fields = [];
  let at = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] as string;
    const len = l.length + (i < lines.length - 1 ? 2 : 0);
    if (len === 0) continue;
    fields.push({
      label: l === "" ? "Linha em branco" : i === 0 ? "Primeira linha" : `Linha ${i + 1}`,
      value: l === "" ? "fim dos cabeçalhos" : l,
      from: at,
      to: at + len,
      ...(notes[i] ? { note: notes[i] } : {}),
    });
    at += len;
  }
  return { id, label, role: "s4", bytes, fields };
}

/** Opaque bytes of known length (encrypted or not shown). */
export function opaque(
  id: string,
  label: string,
  n: number,
  value: string,
  role: Layer["role"] = "crypto",
): Layer {
  return payloadLayer(id, label, Array(n).fill(null), value, role);
}

/** Ethernet frame around a layer stack (for LAN lessons). */
export function ethFrame(
  dst: string,
  src: string,
  names: { dst?: string; src?: string },
  layers: Layer[],
  t: { id: string; title: string; summary: string; where?: string },
  type: number = ETHERTYPE.ipv4,
): Frame {
  return frameOf(t.id, t.title, t.summary, [ethernet(dst, src, type, names), ...layers], t.where);
}

export interface Endpoint {
  ip: string;
  port: number;
}

/**
 * A TCP connection between a client and a server that keeps sequence and acknowledgement
 * numbers right: every frame it returns is what a capture of that conversation would show.
 */
export function tcpSession(cli: Endpoint, srv: Endpoint, isnC: number, isnS: number, ttl = 64) {
  let seqC = isnC;
  let seqS = isnS;
  const seg = (
    fromCli: boolean,
    flags: TcpFlag[],
    app: Layer | null,
    t: { id: string; title: string; summary: string },
    extra: { mss?: number } = {},
  ) => {
    const [a, b] = fromCli ? [cli, srv] : [srv, cli];
    const seq = fromCli ? seqC : seqS;
    const ack = fromCli ? seqS : seqC;
    const f = tcpFrame(
      { src: a.ip, dst: b.ip, sport: a.port, dport: b.port, seq, ack, flags, ttl, ...extra },
      app,
      t,
    );
    const len = (app?.bytes.length ?? 0) + (flags.includes("SYN") || flags.includes("FIN") ? 1 : 0);
    if (fromCli) seqC = (seqC + len) >>> 0;
    else seqS = (seqS + len) >>> 0;
    return f;
  };
  return {
    syn: (id: string) =>
      seg(true, ["SYN"], null, { id, title: "SYN", summary: "Abre a conexão." }, { mss: 1460 }),
    synAck: (id: string) =>
      seg(
        false,
        ["SYN", "ACK"],
        null,
        { id, title: "SYN-ACK", summary: "O servidor aceita." },
        { mss: 1460 },
      ),
    ack: (fromCli: boolean, id: string, title = "ACK", summary = "Confirma o que chegou.") =>
      seg(fromCli, ["ACK"], null, { id, title, summary }),
    data: (fromCli: boolean, app: Layer, t: { id: string; title: string; summary: string }) =>
      seg(fromCli, ["PSH", "ACK"], app, t),
    fin: (fromCli: boolean, id: string) =>
      seg(fromCli, ["FIN", "ACK"], null, { id, title: "FIN", summary: "Fecha este sentido." }),
    get seq() {
      return { cli: seqC, srv: seqS };
    },
  };
}
