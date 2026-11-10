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

/** HTTP headers the lessons send, explained once for every lesson that shows them. */
const HEADER_NOTES: Record<string, string> = {
  host: "Qual site do servidor: um mesmo IP pode hospedar vários nomes",
  "user-agent": "O programa que fez o pedido, com versão",
  accept: "Os formatos que o cliente aceita receber",
  "accept-encoding": "As compressões que o cliente sabe desfazer",
  "accept-language": "Os idiomas preferidos, em ordem",
  connection: "Se a conexão TCP continua aberta para os próximos pedidos",
  "content-type": "O formato do corpo, para quem recebe saber como ler",
  "content-length": "Quantos bytes tem o corpo; é assim que se sabe onde a mensagem acaba",
  "cache-control": "Por quanto tempo e por quem a resposta pode ser guardada",
  etag: "Uma impressão digital da versão; serve para perguntar se mudou",
  "if-none-match": "Só mande de novo se a versão não for mais esta",
  "last-modified": "Quando o recurso mudou pela última vez",
  location: "Para onde ir: acompanha os redirecionamentos",
  "set-cookie": "Pede ao navegador que guarde um valor e o devolva nos próximos pedidos",
  cookie: "O valor guardado que o navegador devolve ao site",
  server: "O software do servidor",
  date: "Quando a resposta foi gerada",
  "strict-transport-security": "Daqui em diante, só HTTPS para este site",
  upgrade: "Pede para trocar de protocolo na mesma conexão",
  via: "Por quais proxies a mensagem passou",
  age: "Há quantos segundos a resposta está guardada num cache",
  "proxy-authorization": "Credenciais para o proxy, não para o site",
  authorization: "Credenciais para o site",
  from: "O remetente que o leitor vê",
  to: "O destinatário que o leitor vê",
  subject: "O assunto",
  "message-id": "Identificador único da mensagem",
  "dkim-signature": "Assinatura do domínio sobre cabeçalhos e corpo",
};

const SMTP_CMD: Record<string, string> = {
  EHLO: "O cliente se apresenta e pede a lista de extensões",
  HELO: "O cliente se apresenta (versão antiga, sem extensões)",
  "MAIL FROM": "O remetente do envelope, para onde voltam os avisos de erro",
  "RCPT TO": "Um destinatário do envelope; pode vir mais de um",
  DATA: "Daqui até a linha com um ponto sozinho vem a mensagem",
  QUIT: "Encerra a sessão",
  STARTTLS: "Pede para cifrar a conexão a partir daqui",
  AUTH: "Login do cliente no servidor de envio",
  USER: "O nome de usuário",
  PASS: "A senha, em texto claro se a conexão não for cifrada",
  RETR: "Pede uma mensagem (ou arquivo) pelo número ou nome",
  DELE: "Marca para apagar",
  LIST: "Pede a lista",
  STAT: "Pede o resumo: quantas e quanto ocupam",
  PASV: "Pede ao servidor uma porta para a conexão de dados",
  PORT: "Diz ao servidor onde se conectar para os dados",
};

/** Note for one line of a text protocol, or "" when nothing general can be said. */
function lineNote(line: string, i: number): string {
  if (i === 0 && /^(GET|POST|PUT|DELETE|HEAD|OPTIONS|CONNECT|PATCH) \S+ HTTP\/\d/.test(line))
    return "Método, caminho e versão do protocolo";
  if (i === 0 && /^HTTP\/\d(\.\d)? \d{3}/.test(line)) {
    const c = line.charAt(9);
    const cls: Record<string, string> = {
      "1": "informação",
      "2": "deu certo",
      "3": "vá a outro lugar",
      "4": "erro do cliente",
      "5": "erro do servidor",
    };
    return `Versão e código de status; ${c}xx quer dizer ${cls[c] ?? "outra coisa"}`;
  }
  if (line.startsWith("+OK")) return "POP3: deu certo";
  if (line.startsWith("-ERR")) return "POP3: falhou";
  const tag = /^(\S+) (OK|NO|BAD|LOGIN|SELECT|FETCH|SEARCH|STORE|LOGOUT|IDLE)\b/i.exec(line);
  if (tag && tag[1] !== "*")
    return "IMAP: cada comando leva uma etiqueta, e a resposta final repete a mesma, por isso podem correr vários ao mesmo tempo";
  if (line.startsWith("* ")) return "IMAP: linha não etiquetada, um dado que chega antes da resposta final";
  const h = /^([A-Za-z][A-Za-z0-9-]*):/.exec(line);
  if (h) return HEADER_NOTES[(h[1] as string).toLowerCase()] ?? "";
  const up = line.toUpperCase();
  for (const [cmd, note] of Object.entries(SMTP_CMD))
    if (up === cmd || up.startsWith(`${cmd} `) || up.startsWith(`${cmd}:`)) return note;
  if (/^\d{3}[ -]/.test(line)) {
    const cls: Record<string, string> = {
      "2": "deu certo",
      "3": "continue",
      "4": "falha temporária, tente de novo",
      "5": "falha definitiva",
    };
    return `Código de resposta; ${line.charAt(0)}xx quer dizer ${cls[line.charAt(0)] ?? "outra coisa"}`;
  }
  return "";
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
      ...(notes[i] ? { note: notes[i] } : lineNote(l, i) ? { note: lineNote(l, i) } : {}),
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
export function tcpSession(
  cli: Endpoint,
  srv: Endpoint,
  isnC: number,
  isnS: number,
  ttl = 64,
  /** Where a capture of each direction was taken, shown on top of the inspector. */
  where?: { up: string; down: string },
) {
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
    const at = where ? (fromCli ? where.up : where.down) : undefined;
    const f = tcpFrame(
      { src: a.ip, dst: b.ip, sport: a.port, dport: b.port, seq, ack, flags, ttl, ...extra },
      app,
      at ? { ...t, where: at } : t,
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
