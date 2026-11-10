import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { frameOf, known, type Layer } from "../../../sim/net/bytes.ts";
import { ipv4, PROTO } from "../../../sim/net/ipv4.ts";
import { tcp } from "../../../sim/net/tcp.ts";
import { clientHello, encrypted, serverHello } from "../../../sim/net/tls13.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { DAVI, LIA, PAGE_REQUEST } from "../plan.ts";

/**
 * TLS 1.3 handshake and certificate chain. ClientHello and ServerHello are real
 * byte layouts (RFC 8446); from EncryptedExtensions on, the bytes are shown as "··" with their
 * real lengths. Certificate sizes are typical values, stated as such.
 */
const SEED = 8446;
const CERT_LEN = 2400;
const CV_LEN = 264;
const FIN_LEN = 36;
const EE_LEN = 10;
export const HTTP_LEN = PAGE_REQUEST.length;

const scene: SceneSpec = {
  viewBox: [960, 520],
  zones: [
    {
      id: "z-obs",
      title: "O que a rede do campus enxerga",
      rect: { x: 300, y: 40, w: 360, h: 150 },
      tone: "attacker",
    },
  ],
  nodes: [
    { id: "lia", kind: "laptop", label: "Lia", sub: LIA.ip, at: [140, 110] },
    {
      id: "obs",
      kind: "router",
      label: "Roteador do campus",
      sub: "vê só o que está em claro",
      at: [480, 110],
      w: 190,
    },
    { id: "davi", kind: "server", label: "Biblioteca", sub: `${DAVI.ip}:443`, at: [830, 110] },
    {
      id: "store",
      kind: "box",
      label: "Raízes confiáveis",
      sub: "repositório do sistema",
      at: [140, 250],
      w: 190,
    },
  ],
  links: [
    { id: "a", from: "lia", to: "obs", style: "bus" },
    { id: "b", from: "obs", to: "davi", style: "bus" },
    { id: "c", from: "lia", to: "store", style: "dashed" },
  ],
  widgets: [
    {
      kind: "table",
      id: "cadeia",
      title: "Cadeia de certificados",
      at: [300, 230],
      columns: ["Nível", "Para quem", "Assinado por", "Verificação"],
      widths: [100, 190, 170, 160],
      rows: 3,
    },
  ],
};

function bytes32(rand: () => number) {
  return Array.from({ length: 32 }, () => randInt(rand, 0, 255));
}

export function build(_p: Params) {
  const b = lessonBuilder();
  const rand = prng(SEED);
  const cRandom = bytes32(rand);
  const sRandom = bytes32(rand);
  const sid = bytes32(rand);
  const cKey = bytes32(rand);
  const sKey = bytes32(rand);
  const ch = clientHello(DAVI.host, { random: cRandom, sessionId: sid, keyShare: cKey });
  const sh = serverHello({ random: sRandom, sessionId: sid, keyShare: sKey });
  let t = 0;
  const row = (who: string, what: string, detail: string) => ({ cols: { t: `msg ${t}`, who, what, detail } });
  const wrap = (tls: Layer, fromLia: boolean, seq: number) => {
    const [src, dst, sport, dport] = fromLia
      ? [LIA.ip, DAVI.ip, LIA.port, 443]
      : [DAVI.ip, LIA.ip, 443, LIA.port];
    const payload = tls.bytes.every((x) => x !== null) ? known(tls.bytes) : [];
    const tl = tcp({
      srcIp: src,
      dstIp: dst,
      sport,
      dport,
      seq,
      ack: 1,
      flags: ["PSH", "ACK"],
      window: 64240,
      payload,
    });
    if (!payload.length)
      tl.fields = tl.fields.map((f) =>
        f.label === "Checksum" ? { ...f, value: "(calculado sobre o conteúdo cifrado)" } : f,
      );
    return [
      ipv4({ src, dst, proto: PROTO.tcp, payloadLen: tl.bytes.length + tls.bytes.length, id: 0x4400 + seq }),
      tl,
      tls,
    ];
  };
  const chainRow = (i: number, cells: string[], mark?: "hit" | "new" | "bad") =>
    b.ev({
      t,
      kind: "row",
      table: "cadeia",
      index: i,
      cells,
      ...(mark ? { mark } : {}),
      role: "crypto",
      label: `${cells[0]}: ${cells[3]}`,
    });

  b.step(
    {
      id: "s1-clienthello",
      title: "ClientHello",
      subtitle: "O que o cliente sabe fazer",
      text: `Depois do handshake TCP, o navegador da Lia manda um **ClientHello** de ${ch.bytes.length} bytes. Nele vão: o nome do site (**SNI**), as versões aceitas (a extensão supported_versions diz TLS 1.3), as suítes de cifra e já um **key_share**: a metade pública de uma troca Diffie-Hellman X25519. Mandar a chave logo no primeiro pacote é o que permite ao TLS 1.3 terminar o handshake em uma ida e volta.`,
      facts: [
        ["SNI", DAVI.host],
        ["Versão", "TLS 1.3 (0x0304)"],
        ["key_share", "X25519, 32 bytes"],
      ],
      highlight: ["lia"],
    },
    () => {
      const fr = b.frame(
        frameOf(
          "f-ch",
          "ClientHello",
          "Um registro TLS de handshake, inteiro em claro.",
          wrap(ch, true, 1),
          "Saindo do notebook da Lia",
        ),
      );
      b.ev({
        t: ++t,
        kind: "move",
        from: "lia",
        to: "davi",
        via: ["obs"],
        role: "crypto",
        label: "ClientHello",
        frame: fr,
        row: row("Lia", "ClientHello", `SNI ${DAVI.host}, key_share X25519`),
      });
      b.ev({
        t,
        kind: "note",
        at: "obs",
        text: `vê: ${DAVI.host}`,
        tone: "warn",
        role: "warn",
        label: "O SNI passa em claro",
      });
    },
  );
  b.step(
    {
      id: "s2-serverhello",
      title: "ServerHello",
      subtitle: "A chave combinada",
      text: "O servidor escolhe a suíte (TLS_AES_128_GCM_SHA256) e responde com o **seu** key_share. Agora cada lado combina a própria chave secreta com a metade pública do outro e chega ao **mesmo segredo**, sem que ele tenha passado pela rede: é o Diffie-Hellman. Desse segredo saem as chaves de handshake. Tudo o que vem depois do ServerHello já vai cifrado.",
      facts: [
        ["Suíte", "TLS_AES_128_GCM_SHA256"],
        ["Segredo", "X25519(a, B) = X25519(b, A)"],
        ["Daqui em diante", "cifrado"],
      ],
      highlight: ["davi"],
    },
    () => {
      const fr = b.frame(
        frameOf(
          "f-sh",
          "ServerHello",
          "A resposta do servidor, ainda em claro.",
          wrap(sh, false, 1),
          "Saindo do servidor",
        ),
      );
      b.ev({
        t: ++t,
        kind: "move",
        from: "davi",
        to: "lia",
        via: ["obs"],
        role: "crypto",
        label: "ServerHello",
        frame: fr,
        row: row("Servidor", "ServerHello", "suíte AES-128-GCM, key_share X25519"),
      });
      b.ev({
        t: ++t,
        kind: "state",
        target: "lia",
        text: "chaves de handshake",
        tone: "active",
        role: "crypto",
        label: "Lia deriva as chaves",
      });
      b.ev({
        t,
        kind: "state",
        target: "davi",
        text: "chaves de handshake",
        tone: "active",
        role: "crypto",
        label: "Servidor deriva as chaves",
      });
    },
  );
  b.step(
    {
      id: "s3-certificado",
      title: "O certificado e a cadeia",
      subtitle: "Quem garante que é mesmo a biblioteca?",
      text: `O servidor manda (já cifrado) o certificado de \`${DAVI.host}\`, assinado por uma **autoridade intermediária**, cujo certificado também vem junto. O navegador sobe a cadeia: a assinatura da folha confere com a chave da intermediária, a da intermediária confere com uma **raiz** que já está no repositório do sistema. Também confere a validade e se o nome bate com o site pedido.`,
      facts: [
        ["Folha", DAVI.host],
        ["Intermediária", "AC Campus Exemplo"],
        ["Raiz", "Raiz Exemplo (no sistema)"],
      ],
      highlight: ["store"],
    },
    () => {
      const fr = b.frame(
        frameOf(
          "f-cert",
          "EncryptedExtensions + Certificate",
          "Certificados viajam cifrados no TLS 1.3. Tamanho típico.",
          wrap(
            encrypted(EE_LEN + CERT_LEN, "EncryptedExtensions e Certificate (folha + intermediária)"),
            false,
            2,
          ),
          "Saindo do servidor",
        ),
      );
      b.ev({
        t: ++t,
        kind: "move",
        from: "davi",
        to: "lia",
        via: ["obs"],
        role: "crypto",
        label: "Certificate (cifrado)",
        frame: fr,
        row: row("Servidor", "Certificate", `≈ ${CERT_LEN} bytes, cifrado`),
      });
      chainRow(0, ["Folha", DAVI.host, "AC Campus Exemplo", "…"], "new");
      chainRow(1, ["Intermediária", "AC Campus Exemplo", "Raiz Exemplo", "…"], "new");
      chainRow(2, ["Raiz", "Raiz Exemplo", "ela mesma", "…"], "new");
      t++;
      chainRow(0, ["Folha", DAVI.host, "AC Campus Exemplo", "nome e validade ok"], "hit");
      t++;
      chainRow(1, ["Intermediária", "AC Campus Exemplo", "Raiz Exemplo", "assinatura ok"], "hit");
      b.ev({ t: ++t, kind: "move", from: "lia", to: "store", role: "crypto", label: "procura a raiz" });
      chainRow(2, ["Raiz", "Raiz Exemplo", "ela mesma", "está no sistema"], "hit");
      b.ev({
        t,
        kind: "state",
        target: "store",
        text: "Raiz Exemplo ✓",
        tone: "good",
        role: "crypto",
        label: "Raiz encontrada",
        row: row("Lia", "Cadeia validada", "folha → intermediária → raiz"),
      });
    },
  );
  b.step(
    {
      id: "s4-finished",
      quiz: {
        kind: "choice",
        prompt:
          "O certificado do servidor é público: qualquer um pode copiá-lo. O que prova que o servidor tem a chave privada dele?",
        options: [
          "A assinatura do CertificateVerify sobre o resumo de todo o handshake",
          "A cadeia de assinaturas até uma raiz confiável",
          "O nome no certificado ser igual ao do site pedido",
        ],
        answer: 0,
        explain:
          "A cadeia e o nome provam que o certificado é legítimo, não que quem o apresenta é o dono. Só quem tem a chave privada da folha consegue assinar o resumo das mensagens desta conexão, que muda a cada handshake.",
      },
      title: "Prova de posse e Finished",
      subtitle: "Ninguém mexeu no handshake",
      text: "Ter o certificado não prova nada: ele é público. No **CertificateVerify**, o servidor assina com a chave privada um resumo de todas as mensagens até ali; só quem tem a chave privada da folha consegue. Depois cada lado manda um **Finished**, um HMAC sobre o mesmo resumo: se um intermediário tivesse alterado qualquer byte do ClientHello, os valores não bateriam.",
      facts: [
        ["CertificateVerify", "assinatura sobre o transcrito"],
        ["Finished", "HMAC sobre o transcrito"],
        ["Idas e voltas", "1 (1-RTT)"],
      ],
    },
    () => {
      const fCv = b.frame(
        frameOf(
          "f-cv",
          "CertificateVerify + Finished",
          "Assinatura e HMAC, cifrados.",
          wrap(encrypted(CV_LEN + FIN_LEN, "CertificateVerify e Finished do servidor"), false, 3),
          "Saindo do servidor",
        ),
      );
      b.ev({
        t: ++t,
        kind: "move",
        from: "davi",
        to: "lia",
        via: ["obs"],
        role: "crypto",
        label: "CertificateVerify + Finished",
        frame: fCv,
        row: row("Servidor", "CertificateVerify + Finished", "assinatura RSA-PSS + HMAC"),
      });
      b.ev({
        t: ++t,
        kind: "state",
        target: "lia",
        text: "servidor autenticado",
        tone: "good",
        role: "crypto",
        label: "Assinatura e Finished conferem",
      });
      b.ev({
        t: ++t,
        kind: "move",
        from: "lia",
        to: "davi",
        via: ["obs"],
        role: "crypto",
        label: "Finished",
        row: row("Lia", "Finished", "HMAC do cliente"),
      });
      b.ev({
        t,
        kind: "state",
        target: "davi",
        text: "handshake completo",
        tone: "good",
        role: "crypto",
        label: "Os dois lados têm as chaves de tráfego",
      });
    },
  );
  b.step(
    {
      id: "s5-dados",
      title: "Dados cifrados",
      subtitle: "AES-GCM com as chaves de tráfego",
      text: `O pedido \`GET /horarios\` agora vai dentro de um registro **application_data**. Quem está no meio vê só o cabeçalho de 5 bytes, com o tamanho, e ${HTTP_LEN + 17} bytes que parecem aleatórios. O GCM também autentica: se alguém trocar um bit, a tag de 16 bytes não confere e o registro é descartado.`,
      facts: [
        ["Pedido", `${HTTP_LEN} bytes de HTTP`],
        ["No fio", `${HTTP_LEN + 1 + 16 + 5} bytes`],
        ["Visível", "tamanho e horário"],
      ],
    },
    () => {
      const fr = b.frame(
        frameOf(
          "f-app",
          "Pedido HTTP cifrado",
          "O mesmo GET da lição de encapsulamento, agora ilegível.",
          wrap(encrypted(HTTP_LEN, "GET /horarios (cifrado)"), true, 2),
          "Saindo do notebook da Lia",
        ),
      );
      b.ev({
        t: ++t,
        kind: "move",
        from: "lia",
        to: "davi",
        via: ["obs"],
        role: "crypto",
        label: "application_data",
        frame: fr,
        row: row("Lia", "Dados", `${HTTP_LEN + 22} bytes cifrados`),
      });
      b.ev({
        t,
        kind: "note",
        at: "obs",
        text: `vê: ${HTTP_LEN + 22} bytes ··`,
        tone: "info",
        role: "crypto",
        label: "O conteúdo é ilegível",
      });
      b.ev({
        t: ++t,
        kind: "move",
        from: "davi",
        to: "lia",
        via: ["obs"],
        role: "crypto",
        label: "application_data",
        row: row("Servidor", "Dados", "a página, cifrada"),
      });
    },
  );
  b.step(
    {
      id: "s6-vazamentos",
      title: "O que ainda vaza",
      subtitle: "Cifrado não quer dizer invisível",
      text: "O conteúdo está protegido, mas quem observa a rede do campus ainda sabe: os **endereços IP**, o **nome do site** (o SNI do ClientHello vai em claro), os **tamanhos** dos registros e os **horários**. Com isso dá para adivinhar muito sobre o que se está fazendo. O Encrypted Client Hello (ECH) cifra o SNI com uma chave publicada no DNS, mas ainda não está em todo lugar.",
      facts: [
        ["Protegido", "caminho, cabeçalhos, conteúdo"],
        ["Visível", "IPs, SNI, tamanhos, horários"],
        ["Remédio para o SNI", "ECH"],
      ],
      highlight: ["obs"],
      quiz: {
        kind: "choice",
        prompt: "O roteador do campus está gravando o tráfego da Lia. O que ele consegue ler?",
        options: [
          "O caminho /horarios",
          `O nome ${DAVI.host}`,
          "Os cookies da sessão",
          "O conteúdo da página",
        ],
        answer: 1,
        explain:
          "O caminho, os cookies e a página vão dentro de registros cifrados. O **nome do site** aparece no SNI do ClientHello, que vai em claro (a não ser que se use ECH).",
      },
    },
    () => {
      b.ev({
        t: ++t,
        kind: "note",
        at: "obs",
        text: `IP ${DAVI.ip}, SNI, tamanhos`,
        tone: "warn",
        role: "warn",
        label: "Metadados visíveis",
        row: row("Observador", "Metadados", "IPs, SNI, tamanhos, horários"),
      });
    },
  );
  return b.done({ clientHello: ch.bytes.length, serverHello: sh.bytes.length });
}

const lesson: LessonModule = {
  meta: {
    slug: "tls13",
    site: "redes",
    title: "TLS 1.3 e a cadeia de certificados",
    summary:
      "Do ClientHello ao primeiro dado cifrado: troca de chaves, cadeia de certificados, prova de posse e o que continua visível.",
    area: "Segurança",
    refs: [
      { rfc: 8446, note: "TLS 1.3" },
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.12.3",
        note: "Segurança da camada de transporte",
        verified: true,
      },
    ],
    simplifications: [
      "Sem retomada de sessão (PSK) nem 0-RTT.",
      "Tamanhos do certificado e da assinatura são valores típicos, não de um certificado real.",
      "A cadeia e as autoridades são fictícias.",
      "Só uma requisição e uma resposta depois do handshake.",
    ],
  },
  scene,
  params: { defaults: {} },
  build,
  intro: {
    text: "Na lição de encapsulamento, qualquer roteador no caminho podia ler o pedido da Lia. Agora ela acessa `https://` e o [[tls]] cifra tudo, depois de provar que do outro lado está mesmo a biblioteca. Abra o inspetor (I) nos dois primeiros pacotes: eles ainda estão em claro.",
    facts: [
      ["Site", `https://${DAVI.host}`],
      ["Versão", "TLS 1.3"],
      ["Troca de chaves", "X25519"],
    ],
  },
  outro: {
    title: "TLS 1.3 em resumo",
    text: "Uma ida e volta basta: o cliente já manda sua parte do Diffie-Hellman, o servidor prova quem é com a cadeia e uma assinatura, e o Finished amarra tudo. Os metadados continuam visíveis.",
    facts: (run) => [
      ["ClientHello", `${run.stats.clientHello} bytes`],
      ["ServerHello", `${run.stats.serverHello} bytes`],
    ],
  },
  next: ["arp-spoofing"],
};

export default lesson;
