import type { FieldNode } from "../../contracts/types.ts";
import { ascii, hex2, hexN, type Layer, u8, u16, u24 } from "./bytes.ts";

/**
 * TLS 1.3 records and the first two handshake messages (RFC 8446 §4.1.2, §4.1.3, §4.2).
 * Random values and key shares come from the caller (seeded). Everything after ServerHello is
 * encrypted and shown as unknown bytes with the right length (§5.2: inner type + 16-byte tag).
 */
type Part = { label: string; value: string; bytes: number[]; note?: string; children?: Part[] };

function flatten(parts: Part[], at: number): { bytes: number[]; fields: FieldNode[] } {
  const bytes: number[] = [];
  const fields: FieldNode[] = [];
  for (const p of parts) {
    const from = at + bytes.length;
    let own = p.bytes;
    let children: FieldNode[] | undefined;
    if (p.children) {
      const inner = flatten(p.children, from + p.bytes.length);
      own = [...p.bytes, ...inner.bytes];
      children = inner.fields;
    }
    bytes.push(...own);
    fields.push({
      label: p.label,
      value: p.value,
      from,
      to: from + own.length,
      ...(p.note ? { note: p.note } : {}),
      ...(children ? { children } : {}),
    });
  }
  return { bytes, fields };
}

const size = (parts: Part[]): number =>
  parts.reduce((n, p) => n + p.bytes.length + (p.children ? size(p.children) : 0), 0);
const short = (b: readonly number[]) => `${b.slice(0, 4).map(hex2).join(" ")} … (${b.length} bytes)`;

function ext(type: number, name: string, body: Part[], note?: string): Part {
  return {
    label: `Extensão ${name}`,
    value: `tipo ${type}`,
    bytes: [...u16(type), ...u16(size(body))],
    ...(note ? { note } : {}),
    children: body,
  };
}

export interface HelloOpts {
  random: number[];
  sessionId: number[];
  keyShare: number[];
}

const SUITES: Record<number, string> = {
  4865: "TLS_AES_128_GCM_SHA256",
  4866: "TLS_AES_256_GCM_SHA384",
  4867: "TLS_CHACHA20_POLY1305_SHA256",
};

function record(
  type: number,
  typeName: string,
  legacy: number,
  body: Part,
  role: Layer["role"],
  id: string,
  label: string,
): Layer {
  const bodyLen = size([body]);
  const parts: Part[] = [
    {
      label: "Cabeçalho do registro",
      value: `${typeName}, ${bodyLen} bytes`,
      bytes: [],
      children: [
        {
          label: "Tipo de conteúdo",
          value: `${type} (${typeName})`,
          bytes: u8(type),
          note: "22 é handshake, 23 dados da aplicação, 21 alerta",
        },
        {
          label: "Versão legada",
          value: hexN(legacy, 4),
          bytes: u16(legacy),
          note: "Fixa por compatibilidade; a versão real vai numa extensão",
        },
        {
          label: "Comprimento",
          value: String(bodyLen),
          bytes: u16(bodyLen),
          note: "Bytes deste registro, depois dos 5 do cabeçalho",
        },
      ],
    },
    body,
  ];
  const { bytes, fields } = flatten(parts, 0);
  return { id, label, role, bytes, fields };
}

function handshake(type: number, name: string, body: Part[]): Part {
  return {
    label: name,
    value: `${size(body)} bytes`,
    bytes: [],
    children: [
      {
        label: "Tipo de mensagem",
        value: `${type} (${name})`,
        bytes: u8(type),
        note: "Qual passo do handshake é este",
      },
      {
        label: "Comprimento",
        value: String(size(body)),
        bytes: u24(size(body)),
        note: "Tamanho da mensagem; pode ocupar vários registros",
      },
      ...body,
    ],
  };
}

export function clientHello(sni: string, o: HelloOpts): Layer {
  if (o.random.length !== 32 || o.keyShare.length !== 32 || o.sessionId.length !== 32)
    throw new Error("Tamanhos inválidos");
  const name = ascii(sni);
  const alpn = [ascii("h2"), ascii("http/1.1")];
  const alpnList = alpn.flatMap((p) => [p.length, ...p]);
  const body: Part[] = [
    {
      label: "Versão legada",
      value: "0x0303 (TLS 1.2)",
      bytes: u16(0x0303),
      note: "Finge ser TLS 1.2 para não assustar equipamentos antigos; a versão real vai em supported_versions",
    },
    { label: "Random", value: short(o.random), bytes: o.random, note: "32 bytes aleatórios do cliente" },
    {
      label: "ID de sessão legado",
      value: "32 bytes",
      bytes: [32, ...o.sessionId],
      note: "Só para atravessar middleboxes antigos",
    },
    {
      label: "Suítes de cifra",
      value: "3 opções",
      bytes: u16(6),
      children: Object.entries(SUITES).map(([k, v]) => ({
        label: "Suíte",
        value: v,
        bytes: u16(Number(k)),
        note: "Cifra autenticada e hash; o servidor escolhe uma da lista",
      })),
    },
    {
      label: "Compressão legada",
      value: "nenhuma",
      bytes: [1, 0],
      note: "Sempre vazia: comprimir antes de cifrar abriu ataques como o CRIME",
    },
    {
      label: "Extensões",
      value: "",
      bytes: [],
      children: [],
    },
  ];
  const exts: Part[] = [
    ext(
      0,
      "server_name (SNI)",
      [
        {
          label: "Nome do servidor",
          value: sni,
          bytes: [...u16(name.length + 3), 0, ...u16(name.length), ...name],
        },
      ],
      "Vai em claro: quem observa a rede sabe o site",
    ),
    ext(10, "supported_groups", [{ label: "Grupos", value: "x25519", bytes: [...u16(2), ...u16(0x001d)] }]),
    ext(13, "signature_algorithms", [
      {
        label: "Algoritmos",
        value: "rsa_pss_rsae_sha256, ecdsa_secp256r1_sha256",
        bytes: [...u16(4), ...u16(0x0804), ...u16(0x0403)],
      },
    ]),
    ext(16, "ALPN", [
      { label: "Protocolos", value: "h2, http/1.1", bytes: [...u16(alpnList.length), ...alpnList] },
    ]),
    ext(
      43,
      "supported_versions",
      [{ label: "Versões", value: "0x0304 (TLS 1.3)", bytes: [2, ...u16(0x0304)] }],
      "Aqui o cliente diz que fala TLS 1.3",
    ),
    ext(51, "key_share", [
      {
        label: "x25519",
        value: short(o.keyShare),
        bytes: [...u16(36), ...u16(0x001d), ...u16(32), ...o.keyShare],
        note: "Metade pública do Diffie-Hellman do cliente",
      },
    ]),
  ];
  const extBlock = body[5] as Part;
  extBlock.bytes = u16(size(exts));
  extBlock.value = `${exts.length} extensões, ${size(exts)} bytes`;
  extBlock.children = exts;
  return record(22, "handshake", 0x0301, handshake(1, "ClientHello", body), "crypto", "tls", "TLS 1.3");
}

export function serverHello(o: HelloOpts, suite = 0x1301): Layer {
  const body: Part[] = [
    {
      label: "Versão legada",
      value: "0x0303",
      bytes: u16(0x0303),
      note: "Fixa; a versão real vai em supported_versions",
    },
    { label: "Random", value: short(o.random), bytes: o.random, note: "32 bytes aleatórios do servidor" },
    {
      label: "ID de sessão legado",
      value: "eco do cliente",
      bytes: [32, ...o.sessionId],
      note: "Devolve o do cliente, só para parecer TLS 1.2 a quem está no caminho",
    },
    {
      label: "Suíte escolhida",
      value: SUITES[suite] ?? hexN(suite, 4),
      bytes: u16(suite),
      note: "Uma das que o cliente ofereceu; vale para o resto da conexão",
    },
    { label: "Compressão legada", value: "0", bytes: [0] },
    {
      label: "Extensões",
      value: "2 extensões",
      bytes: u16(6 + 40),
      children: [
        ext(43, "supported_versions", [{ label: "Versão", value: "0x0304 (TLS 1.3)", bytes: u16(0x0304) }]),
        ext(51, "key_share", [
          {
            label: "x25519",
            value: short(o.keyShare),
            bytes: [...u16(0x001d), ...u16(32), ...o.keyShare],
            note: "Metade pública do servidor; os dois lados já calculam o segredo",
          },
        ]),
      ],
    },
  ];
  return record(22, "handshake", 0x0303, handshake(2, "ServerHello", body), "crypto", "tls", "TLS 1.3");
}

/** An encrypted record (application_data on the wire), `inner` bytes of plaintext. */
export function encrypted(inner: number, what: string): Layer {
  const len = inner + 1 + 16;
  const hdr = flatten(
    [
      {
        label: "Tipo de conteúdo",
        value: "23 (application_data)",
        bytes: u8(23),
        note: "Sempre 23 por fora; o tipo real está cifrado",
      },
      { label: "Versão legada", value: "0x0303", bytes: u16(0x0303), note: "Fixa, para parecer TLS 1.2" },
      { label: "Comprimento", value: String(len), bytes: u16(len), note: "O tamanho continua visível" },
    ],
    0,
  );
  const fields: FieldNode[] = [
    { label: "Cabeçalho do registro", value: `${len} bytes cifrados`, from: 0, to: 5, children: hdr.fields },
    {
      label: "Conteúdo cifrado",
      value: what,
      from: 5,
      to: 5 + inner + 1,
      note: "AES-GCM: sem a chave, só se vê o tamanho",
    },
    { label: "Tag de autenticação", value: "16 bytes", from: 5 + inner + 1, to: 5 + len },
  ];
  return {
    id: "tls",
    label: "TLS 1.3 (cifrado)",
    role: "crypto",
    bytes: [...hdr.bytes, ...new Array<null>(len).fill(null)],
    fields,
  };
}
