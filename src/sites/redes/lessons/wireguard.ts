import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  accepts,
  DATA_HEADER,
  encapsulate,
  fits,
  INIT_BYTES,
  IPV4,
  mss,
  overhead,
  PATH_MTU,
  type Peer,
  PORT,
  REJECT_AFTER_S,
  REKEY_AFTER_S,
  RESP_BYTES,
  route,
  safeMtu,
  segments,
  TAG,
  UDP,
} from "../../../sim/net/wireguard.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";
import { wireguard as practice } from "../practice.ts";

/**
 * A road-warrior VPN: a notebook on café Wi-Fi reaches a server inside the office through a
 * WireGuard tunnel. Handshake, encapsulation byte by byte, MTU, AllowedIPs and roaming.
 */
export const DEFAULTS = { carga: 1200, mtu: 1420, tudo: false };

const SERVER = "192.168.1.10";
const SITE = "203.0.113.80";
const NB_TUN = "10.8.0.2";
const C_TUN = "10.8.0.3";
const GW_PUB = "198.51.100.7";
const NB_WIFI = "203.0.113.5";
const NB_4G = "192.0.2.44";

function clamp(p: Params) {
  const data = Math.min(1460, Math.max(1, Math.round(Number(p.carga ?? DEFAULTS.carga))));
  const mtu = Math.min(1500, Math.max(1280, Math.round(Number(p.mtu ?? DEFAULTS.mtu))));
  return { data, mtu, all: p.tudo === true };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 600],
    zones: [
      { id: "z-fora", title: "Fora do escritório", rect: { x: 20, y: 40, w: 220, h: 330 }, tone: "user" },
      { id: "z-net", title: "Internet", rect: { x: 270, y: 40, w: 260, h: 330 }, tone: "wan" },
      {
        id: "z-esc",
        title: "Escritório 192.168.1.0/24",
        rect: { x: 560, y: 40, w: 380, h: 330 },
        tone: "lan",
      },
    ],
    nodes: [
      { id: "nb", kind: "laptop", label: "Notebook", sub: `túnel ${NB_TUN}`, at: [130, 140] },
      { id: "pc", kind: "laptop", label: "Peer C", sub: `túnel ${C_TUN}`, at: [130, 300], hidden: true },
      { id: "net", kind: "cloud", label: "Internet", at: [400, 140] },
      { id: "site", kind: "server", label: "Site público", sub: SITE, at: [400, 300] },
      { id: "gw", kind: "router", label: "Gateway", sub: `${GW_PUB}:${PORT}`, at: [680, 140] },
      { id: "srv", kind: "server", label: "Servidor interno", sub: SERVER, at: [860, 300] },
    ],
    links: [
      { id: "l-nb", from: "nb", to: "net" },
      {
        id: "l-pc",
        from: "pc",
        to: "net",
        via: [
          [300, 300],
          [300, 140],
        ],
      },
      { id: "l-site", from: "net", to: "site" },
      { id: "l-gw", from: "net", to: "gw" },
      { id: "l-srv", from: "gw", to: "srv" },
    ],
    widgets: [
      {
        kind: "table",
        id: "camadas",
        title: "Um pacote no túnel, de fora para dentro",
        at: [40, 400],
        columns: ["Camada", "Bytes"],
        widths: [250, 70],
        rows: 5,
      },
      {
        kind: "table",
        id: "allowed",
        title: "AllowedIPs: quem pode o quê",
        at: [390, 400],
        columns: ["Em", "Peer", "AllowedIPs"],
        widths: [70, 70, 220],
        rows: 3,
      },
      { kind: "counter", id: "extra", title: "Sobrecarga", at: [770, 400] },
      { kind: "counter", id: "externo", title: "Pacote externo", at: [770, 490] },
    ],
  };
}

export function build(p: Params) {
  const { data, mtu, all } = clamp(p);
  const b = lessonBuilder();
  const c = talk(
    b,
    {
      nb: "notebook",
      pc: "peer C",
      net: "Internet",
      site: "site público",
      gw: "gateway",
      srv: "servidor interno",
    },
    (t) => String(t),
  );

  const segs = segments(data, mtu);
  const first = segs[0] ?? data;
  const inner = first + 40;
  const enc = encapsulate(inner, mtu);
  const full4 = encapsulate(mtu, mtu);
  const full6 = encapsulate(mtu, mtu, true);
  const ok4 = fits(mtu, false);
  const ok6 = fits(mtu, true);
  const safe = safeMtu();

  const nbPeers: Peer[] = [
    { name: "gateway", allowed: all ? ["0.0.0.0/0"] : ["10.8.0.1/32", "192.168.1.0/24"] },
  ];
  const gwPeers: Peer[] = [
    { name: "notebook", allowed: [`${NB_TUN}/32`] },
    { name: "peer C", allowed: [`${C_TUN}/32`] },
  ];
  const toServer = route(nbPeers, SERVER);
  const toSite = route(nbPeers, SITE);
  const cPeer = gwPeers[1] ?? { name: "peer C", allowed: [] };
  const forgedOk = accepts(cPeer, NB_TUN);

  b.step(
    {
      id: "s1-fora",
      title: "Longe do escritório",
      subtitle: `${SERVER} não é alcançável`,
      text: `Um notebook no Wi-Fi de um café precisa do servidor interno ${SERVER}. Esse é um [[ip-privado]]: nenhum roteador da Internet sabe chegar a ele, e o [[firewall]] do escritório não aceitaria a conexão. Além disso, qualquer um no mesmo Wi-Fi vê os pacotes do notebook. Uma [[vpn]] resolve as duas coisas: cria um túnel cifrado até o gateway do escritório, que entrega os pacotes na rede interna como se o notebook estivesse lá dentro.`,
      facts: [
        ["Destino", SERVER],
        ["Notebook", `${NB_WIFI} (Wi-Fi)`],
        ["Gateway", `${GW_PUB}:${PORT}`],
      ],
      highlight: ["nb", "srv"],
    },
    () => {
      c.send("nb", "net", `para ${SERVER}`, {
        role: "bad",
        lost: true,
        what: "pacote para endereço privado",
        detail: "nenhuma rota na Internet",
      });
      c.note("net", "sem rota para 192.168.x", "bad", { dt: 1 });
    },
  );

  b.step(
    {
      id: "s2-handshake",
      title: "Um aperto de mão",
      subtitle: `${INIT_BYTES} + ${RESP_BYTES} bytes, 1 ida e volta`,
      text: `No [[wireguard]], cada lado já conhece a chave pública do outro, configurada à mão, como o known_hosts do SSH. Não há negociação de algoritmos: Curve25519, ChaCha20-Poly1305 e BLAKE2s, sempre. O notebook manda uma iniciação de ${INIT_BYTES} bytes com uma chave efêmera e um carimbo de tempo cifrado; o gateway responde com ${RESP_BYTES} bytes. Um [[diffie-hellman]] entre chaves efêmeras e estáticas gera as chaves de sessão em uma só ida e volta, com [[sigilo-futuro]].`,
      facts: [
        ["Iniciação", `${INIT_BYTES} bytes`],
        ["Resposta", `${RESP_BYTES} bytes`],
        ["Porta", `UDP ${PORT}`],
      ],
      highlight: ["nb", "gw"],
    },
    () => {
      c.state("nb", "chave do gateway", { role: "crypto", label: "chave pública do gateway configurada" });
      c.state("gw", "chave do notebook", {
        dt: 0,
        role: "crypto",
        label: "chave pública do notebook configurada",
      });
      c.send("nb", "gw", "iniciação", {
        via: ["net"],
        role: "crypto",
        what: "handshake: iniciação",
        detail: `${INIT_BYTES} B, chave efêmera + carimbo`,
      });
      c.send("gw", "nb", "resposta", {
        via: ["net"],
        role: "crypto",
        what: "handshake: resposta",
        detail: `${RESP_BYTES} B, chave efêmera`,
      });
      c.state("nb", "sessão ativa", { tone: "good", role: "crypto", label: "chaves de sessão" });
      c.state("gw", "sessão ativa", { dt: 0, tone: "good", role: "crypto", label: "chaves de sessão" });
    },
  );

  const segText =
    segs.length > 1
      ? `Com MTU ${mtu}, cabem ${mss(mtu)} bytes de dados por segmento TCP, e os ${data} bytes vão em ${segs.length} pacotes; o primeiro tem ${inner} bytes.`
      : `${data === 1 ? "O 1 byte" : `Os ${data} bytes`} de dados com os cabeçalhos IP e TCP formam um pacote de ${inner} bytes.`;
  const padText =
    enc.padding > 0
      ? `Ele é completado com ${enc.padding} ${enc.padding === 1 ? "byte" : "bytes"} até um múltiplo de 16, o que disfarça o tamanho exato.`
      : "Ele não recebe enchimento.";
  const bigText = enc.outer > PATH_MTU ? ` São mais de ${PATH_MTU} bytes, problema do próximo passo.` : "";
  b.step(
    {
      id: "s3-encapsula",
      title: "Pacote dentro de pacote",
      subtitle: `${inner} → ${enc.outer} bytes`,
      text: `${segText} ${padText} Depois é cifrado e ganha um cabeçalho de ${DATA_HEADER} bytes (tipo, índice da sessão e um contador) e uma tag de ${TAG} bytes ao final. Tudo vai num datagrama [[udp]] para ${GW_PUB}.${bigText} No Wi-Fi só se vê notebook falando com gateway; destino real e conteúdo seguem cifrados. O contador muda a cada pacote e impede que um pacote gravado seja aceito de novo.`,
      facts: [
        ["Interno", `${inner} bytes`],
        ["Externo", `${enc.outer} bytes`],
        ["Sobrecarga", `${enc.extra} bytes`],
      ],
      highlight: ["nb"],
      quiz: {
        kind: "number",
        prompt: `O pacote interno de ${inner} bytes vira ${enc.plain} com o enchimento. Somando cabeçalho WireGuard, tag, UDP e IPv4 externos, quantos bytes tem o pacote que sai?`,
        answer: enc.outer,
        unit: "bytes",
        explain: `${IPV4} + ${UDP} + ${DATA_HEADER} + ${enc.plain} + ${TAG} = ${enc.outer} bytes.`,
      },
    },
    () => {
      const rows: [string, number][] = [
        ["IPv4 externo: notebook → gateway", IPV4],
        [`UDP para a porta ${PORT}`, UDP],
        ["Cabeçalho: tipo, índice, contador", DATA_HEADER],
        [
          enc.padding > 0 ? `Pacote interno cifrado +${enc.padding} enchim.` : "Pacote interno cifrado",
          enc.plain,
        ],
        ["Tag Poly1305", TAG],
      ];
      rows.forEach(([layer, n], i) => {
        c.row("camadas", i, [layer, String(n)], {
          dt: i === 0 ? 1 : 0,
          mark: "new",
          role: i === 3 ? "crypto" : "b",
        });
      });
      c.send("nb", "gw", `UDP ${enc.outer} B`, {
        via: ["net"],
        role: "crypto",
        what: `para ${SERVER}, dentro do túnel`,
        detail: `${inner} B dentro de ${enc.outer} B`,
      });
      c.send("gw", "srv", `${inner} B`, { role: "a", what: "decifrado e entregue", detail: `de ${NB_TUN}` });
      c.count("extra", `${enc.extra} B`, { label: `${enc.extra} bytes a mais` });
      c.count("externo", `${enc.outer} B`, { label: `pacote externo de ${enc.outer} bytes` });
    },
  );

  const mtuText =
    ok4 && ok6
      ? `Com MTU ${mtu}, o maior pacote externo tem ${full4.outer} bytes sobre IPv4 e ${full6.outer} sobre IPv6: passa nos dois.`
      : ok4
        ? `Com MTU ${mtu}, o maior pacote externo tem ${full4.outer} bytes sobre IPv4, que passa, mas ${full6.outer} sobre IPv6, que não cabe.`
        : `Com MTU ${mtu}, o maior pacote externo tem ${full4.outer} bytes: não cabe nem sobre IPv4, e o pacote é fragmentado ou descartado.`;
  b.step(
    {
      id: "s4-mtu",
      title: "O túnel encolhe o pacote",
      subtitle: `MTU ${mtu}: ${ok6 ? "cabe" : ok4 ? "só IPv4" : "não cabe"}`,
      text: `O caminho até o gateway aceita pacotes de até ${PATH_MTU} bytes, a [[mtu]] da Ethernet. Um pacote interno cheio ganha ${overhead(false)} bytes com IPv4 por fora e ${overhead(true)} com IPv6. ${mtuText} Por isso a interface do túnel usa MTU ${safe} por padrão, e o TCP dentro dela anuncia [[mss|MSS]] de ${mss(safe)}. Se a MTU passa do limite, pacotes grandes somem enquanto os pequenos passam: páginas que carregam pela metade.`,
      facts: [
        ["MTU do túnel", String(mtu)],
        ["Externo IPv4", `${full4.outer} bytes`],
        ["Externo IPv6", `${full6.outer} bytes`],
      ],
      highlight: ["nb", "net"],
    },
    () => {
      c.send("nb", "net", `${full4.outer} B`, {
        role: ok4 ? "crypto" : "bad",
        what: `pacote cheio, IPv4 por fora`,
        detail: ok4 ? `cabe em ${PATH_MTU}` : `maior que ${PATH_MTU}`,
        ...(ok4 ? {} : { lost: true }),
      });
      if (ok4) c.send("net", "gw", `${full4.outer} B`, { role: "crypto", what: "chega ao gateway" });
      c.note(
        "net",
        ok6 ? `IPv6: ${full6.outer} B cabe` : `IPv6: ${full6.outer} B não cabe`,
        ok6 ? "good" : "bad",
        {
          dt: 1,
        },
      );
      c.count("extra", `${overhead(false)}/${overhead(true)} B`, {
        label: `${overhead(false)} bytes com IPv4, ${overhead(true)} com IPv6`,
      });
      c.count("externo", `${full4.outer} B`, { label: `maior pacote externo IPv4: ${full4.outer} bytes` });
    },
  );

  const siteText = toSite
    ? `Com AllowedIPs 0.0.0.0/0, até o tráfego para o site público ${SITE} entra no túnel e sai pelo escritório.`
    : `O site público ${SITE} não está em nenhum AllowedIPs, então vai direto pela Internet, fora do túnel.`;
  b.step(
    {
      id: "s5-allowed",
      title: "Roteamento pela chave",
      subtitle: forgedOk ? "origem aceita" : "origem falsa descartada",
      text: `No [[roteamento-por-chave]], cada peer tem uma lista AllowedIPs que vale nos dois sentidos. Na saída, ela funciona como tabela de rotas: ${SERVER} casa com ${toServer?.prefix ?? "nenhum prefixo"} e vai cifrado para o gateway. ${siteText} Na entrada, o gateway decifra e confere a origem interna: o peer C, com chave própria, tenta mandar um pacote dizendo vir de ${NB_TUN}, mas a chave dele só permite ${C_TUN}, e o pacote é descartado.`,
      facts: [
        [SERVER, toServer ? "túnel" : "direto"],
        [SITE, toSite ? "túnel" : "direto"],
        ["Origem falsa", forgedOk ? "aceita" : "descartada"],
      ],
      highlight: ["gw"],
      quiz: {
        kind: "choice",
        prompt: `Por que o gateway descarta o pacote do peer C com origem ${NB_TUN}?`,
        options: [
          `A chave do peer C só autoriza a origem ${C_TUN}`,
          "O contador do pacote já tinha sido usado",
          "O pacote veio de uma porta UDP errada",
        ],
        answer: 0,
        explain:
          "A chave que decifrou o pacote identifica quem mandou, e esse peer só pode usar os endereços da lista dele.",
      },
    },
    () => {
      c.show(["pc"]);
      const tbl: [string, string, string][] = [
        ["notebook", "gateway", nbPeers[0]?.allowed.join(", ") ?? ""],
        ["gateway", "notebook", `${NB_TUN}/32`],
        ["gateway", "peer C", `${C_TUN}/32`],
      ];
      tbl.forEach((r, i) => {
        c.row("allowed", i, r, { dt: i === 0 ? 1 : 0, mark: "new", role: "ctrl" });
      });
      c.send("nb", "gw", `para ${SERVER}`, {
        via: ["net"],
        role: "crypto",
        what: `${SERVER}: casa com ${toServer?.prefix ?? "?"}`,
        detail: "vai pelo túnel",
      });
      c.send("gw", "srv", "entregue", { role: "a", what: "origem confere", detail: NB_TUN });
      if (toSite)
        c.send("nb", "gw", `para ${SITE}`, {
          via: ["net"],
          role: "crypto",
          what: `${SITE}: casa com 0.0.0.0/0`,
          detail: "túnel completo",
        });
      else
        c.send("nb", "site", `para ${SITE}`, {
          via: ["net"],
          role: "a",
          what: `${SITE}: fora da lista`,
          detail: "direto",
        });
      c.send("pc", "gw", `origem ${NB_TUN}?`, {
        via: ["net"],
        role: "bad",
        what: "peer C finge ser o notebook",
        detail: `chave do peer C, origem ${NB_TUN}`,
      });
      c.state("gw", "origem fora da lista", {
        tone: "bad",
        role: "bad",
        label: "descartado",
        detail: `peer C só pode usar ${C_TUN}`,
      });
    },
  );

  b.step(
    {
      id: "s6-roaming",
      title: "Trocar de rede sem cair",
      subtitle: `novas chaves a cada ${REKEY_AFTER_S} s`,
      text: `O notebook sai do Wi-Fi e passa para o 4G: o endereço público muda de ${NB_WIFI} para ${NB_4G}. Não há conexão para refazer: o gateway vê um pacote autenticado vindo de outro endereço e passa a responder para lá. Pacotes sem uma chave conhecida não recebem resposta nenhuma, então uma varredura não descobre nem que a porta está aberta. A cada ${REKEY_AFTER_S} s um handshake novo troca as chaves; uma chave com ${REJECT_AFTER_S} s não é mais aceita.`,
      facts: [
        ["Novo endereço", NB_4G],
        ["Troca de chaves", `${REKEY_AFTER_S} s`],
        ["Sem chave", "sem resposta"],
      ],
      highlight: ["nb", "gw"],
      quiz: {
        kind: "choice",
        prompt: "O notebook mudou de rede. Como o gateway descobre o novo endereço?",
        options: [
          "Pelo próximo pacote autenticado, que chega do endereço novo",
          "O notebook refaz a configuração com a chave nova",
          "Um servidor DNS avisa o gateway da mudança",
        ],
        answer: 0,
        explain:
          "A identidade é a chave, não o endereço; o gateway responde para onde veio o último pacote válido.",
      },
    },
    () => {
      c.hide(["pc"]);
      c.state("nb", `4G ${NB_4G}`, { tone: "warn", role: "warn", label: "notebook mudou de rede" });
      c.send("nb", "gw", "dados", {
        via: ["net"],
        role: "crypto",
        what: "pacote autenticado",
        detail: `de ${NB_4G}`,
      });
      c.state("gw", `fala com ${NB_4G}`, {
        tone: "good",
        role: "crypto",
        label: "endereço do peer atualizado",
      });
      c.send("gw", "nb", "dados", {
        via: ["net"],
        role: "crypto",
        what: "resposta",
        detail: `para ${NB_4G}`,
      });
      c.send("net", "gw", "sonda", {
        role: "bad",
        lost: true,
        what: "pacote sem chave conhecida",
        detail: "sem resposta",
      });
    },
  );

  return b.done({
    inner,
    outer: enc.outer,
    padding: enc.padding,
    extra: enc.extra,
    full4: full4.outer,
    full6: full6.outer,
    fits6: ok6 ? "sim" : "não",
    server: toServer ? "túnel" : "direto",
    site: toSite ? "túnel" : "direto",
    forged: forgedOk ? "aceita" : "descartada",
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "wireguard",
    site: "redes",
    title: "WireGuard: uma VPN por dentro",
    summary:
      "Um notebook no café alcança um servidor do escritório por um túnel: o aperto de mão de uma ida e volta, o pacote cifrado dentro de UDP byte a byte, a MTU menor do túnel, AllowedIPs como rotas e filtro, e a troca de rede sem cair.",
    area: "Segurança",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.10.2",
        note: "Redes privadas virtuais",
        verified: true,
      },
      {
        url: "https://www.wireguard.com/papers/wireguard.pdf",
        title: "WireGuard: Next Generation Kernel Network Tunnel",
      },
    ],
    simplifications: [
      "O handshake aparece sem os cookies que o gateway usa quando está sob carga.",
      `O caminho até o gateway tem MTU ${PATH_MTU} nos dois sentidos.`,
      "O peer C e o notebook usam o mesmo gateway; numa rede real cada um teria a sua lista.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "carga", kind: "int", label: "Bytes de dados da aplicação", min: 1, max: 1460 },
      { key: "mtu", kind: "int", label: "MTU da interface do túnel", min: 1280, max: 1500, step: 10 },
      { key: "tudo", kind: "bool", label: "Túnel completo (AllowedIPs 0.0.0.0/0)" },
    ],
  },
  build,
  intro: {
    text: "Uma VPN leva os pacotes de um computador distante para dentro de uma rede privada, cifrados pelo caminho. Você vai seguir um pacote do notebook ao servidor interno, contar os bytes que o túnel acrescenta e ver como a chave de cada peer decide o que entra e o que sai.",
    facts: [
      ["Protocolo", "WireGuard"],
      ["Transporte", `UDP ${PORT}`],
      ["Destino", SERVER],
    ],
  },
  outro: {
    title: "WireGuard em resumo",
    text: "O WireGuard cifra pacotes IP inteiros e os leva dentro de UDP. As chaves públicas são configuradas antes; o aperto de mão de uma ida e volta gera chaves de sessão, trocadas a cada dois minutos. O túnel acrescenta dezenas de bytes, por isso a interface usa uma MTU menor. AllowedIPs diz o que vai para cada peer e o que cada peer pode mandar, e quem não tem chave não recebe resposta.",
    facts: (run) => [
      ["Pacote", `${run.stats.inner} → ${run.stats.outer} bytes`],
      ["Sobrecarga", `${run.stats.extra} bytes`],
      ["Origem falsa", String(run.stats.forged)],
    ],
  },
  next: ["ssh", "tls13", "nat"],
  practice,
};

export default lesson;
