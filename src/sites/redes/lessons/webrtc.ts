import type { LessonModule, Params } from "../../../contracts/types.ts";
import { stun } from "../../../sim/net/stun.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { prng, randInt } from "../../../sim/shared/prng.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { GW, LIA } from "../plan.ts";
import { opaque, udpFrame } from "../wire.ts";

/**
 * WebRTC between two NATs: signaling through a server, STUN to learn the public address, ICE
 * checks that punch holes in both NATs, DTLS-SRTP media peer to peer, and TURN when a NAT
 * maps each destination to a different port (Lab).
 */
const SEED = 8445;
const ANA = { ip: "192.168.0.10", port: 50200, pub: "203.0.113.140" } as const;
export const STUN_SRV = { ip: "198.51.100.3", port: 3478 } as const;
const LIA_LOCAL = 50100;
export const LIA_PUB = 40050;
const ANA_PUB = 61010;
export const DEFAULTS = { simetrico: false };

const scene = seqScene(
  [
    { id: "lia", kind: "laptop", label: "Lia", sub: `${LIA.ip}:${LIA_LOCAL}`, at: [100, 300] },
    { id: "natl", kind: "router", label: "NAT do campus", sub: GW.wanIp, at: [300, 300] },
    { id: "sig", kind: "server", label: "Servidor do app", sub: "sinalização", at: [500, 80] },
    {
      id: "stun",
      kind: "server",
      label: "STUN / TURN",
      sub: `${STUN_SRV.ip}:${STUN_SRV.port}`,
      at: [500, 470],
    },
    { id: "nata", kind: "router", label: "NAT da casa", sub: ANA.pub, at: [700, 300] },
    { id: "ana", kind: "laptop", label: "Ana", sub: `${ANA.ip}:${ANA.port}`, at: [900, 300] },
  ],
  {
    width: 1000,
    height: 620,
    links: [
      { id: "a", from: "lia", to: "natl", style: "bus" },
      { id: "b", from: "natl", to: "nata", style: "bus" },
      { id: "c", from: "nata", to: "ana", style: "bus" },
      { id: "d", from: "natl", to: "sig", style: "dashed" },
      { id: "e", from: "nata", to: "sig", style: "dashed" },
      { id: "f", from: "natl", to: "stun", style: "dashed" },
      { id: "g", from: "nata", to: "stun", style: "dashed" },
    ],
    zones: [
      { id: "z1", title: "Campus", rect: { x: 20, y: 220, w: 360, h: 160 }, tone: "lan" },
      { id: "z2", title: "Casa da Ana", rect: { x: 620, y: 220, w: 360, h: 160 }, tone: "lan" },
    ],
  },
);

export function build(p: Params) {
  const sym = p.simetrico === true;
  const b = lessonBuilder();
  const c = talk(b, {
    lia: "Lia",
    natl: "NAT do campus",
    sig: "Servidor do app",
    stun: "STUN/TURN",
    nata: "NAT da Ana",
    ana: "Ana",
  });
  const rand = prng(SEED);
  const tid = () => Array.from({ length: 12 }, () => randInt(rand, 0, 255));
  const t1 = tid();
  const t2 = tid();
  const t3 = tid();
  const liaPub = { ip: GW.wanIp, port: LIA_PUB };

  b.step(
    {
      id: "s1-problema",
      title: "Dois lados atrás de NAT",
      subtitle: "Ninguém consegue chamar ninguém",
      text: "A Lia quer fazer uma chamada de vídeo direta com a Ana. As duas estão atrás de [[nat]]: nenhuma tem um endereço que a outra consiga chamar, e um pacote de fora sem tradução é descartado. O [[webrtc]] resolve em três partes: um servidor do aplicativo para trocar recados, o STUN para cada uma descobrir como é vista de fora e o ICE para testar caminhos.",
      facts: [
        ["Lia", `${LIA.ip} atrás de ${GW.wanIp}`],
        ["Ana", `${ANA.ip} atrás de ${ANA.pub}`],
        ["Conexão de fora", "descartada pelos dois NATs"],
      ],
      highlight: ["natl", "nata"],
    },
    () => {
      c.send("lia", "nata", "chamada direta?", {
        dt: 10,
        via: ["natl"],
        role: "warn",
        detail: "sem endereço para chamar",
      });
      c.state("nata", "sem tradução: descarta", { dt: 0, tone: "bad", role: "warn" });
    },
  );

  b.step(
    {
      id: "s2-stun",
      title: "Como me veem de fora?",
      subtitle: "Um pedido STUN",
      text: `A Lia manda um pedido STUN de 20 bytes para ${STUN_SRV.ip}. O NAT do campus traduz a origem para ${GW.wanIp}:${LIA_PUB}, e o servidor devolve exatamente isso no atributo XOR-MAPPED-ADDRESS, embaralhado com o cookie mágico para que nenhum NAT "corrija" o endereço no meio do caminho. Agora a Lia conhece o seu **candidato refletido**.`,
      facts: [
        ["Endereço local", `${LIA.ip}:${LIA_LOCAL}`],
        ["Como o servidor viu", `${GW.wanIp}:${LIA_PUB}`],
        ["Pedido", "20 bytes"],
      ],
      highlight: ["stun"],
    },
    () => {
      c.send("lia", "stun", "Binding", {
        dt: 15,
        via: ["natl"],
        frame: udpFrame(
          { src: LIA.ip, dst: STUN_SRV.ip, sport: LIA_LOCAL, dport: STUN_SRV.port },
          stun({ response: false, tid: t1 }),
          { id: "f-stun-req", title: "Pedido STUN", summary: "Como me vê?", names: { dport: "3478 = STUN" } },
        ),
      });
      c.send("stun", "lia", `${GW.wanIp}:${LIA_PUB}`, {
        dt: 15,
        via: ["natl"],
        role: "s4",
        frame: udpFrame(
          { src: STUN_SRV.ip, dst: GW.wanIp, sport: STUN_SRV.port, dport: LIA_PUB },
          stun({ response: true, tid: t1, mapped: liaPub, note: "O mesmo ID do pedido" }),
          { id: "f-stun-res", title: "Resposta STUN", summary: "Seu endereço público." },
        ),
        detail: "candidato refletido",
      });
    },
  );

  b.step(
    {
      id: "s3-sinalizacao",
      title: "Trocando recados",
      subtitle: "Oferta, resposta e candidatos",
      text: `Pelo servidor do aplicativo (em geral por WebSocket), a Lia manda uma **oferta**: os formatos de áudio e vídeo que aceita, a impressão digital do seu certificado e a lista de candidatos (o endereço local e ${GW.wanIp}:${LIA_PUB}). A Ana, que fez o mesmo com o STUN, devolve uma **resposta** com os dela. O servidor só repassa recados; a mídia não vai passar por ele.`,
      facts: [
        ["Canal de recados", "servidor do app"],
        ["Candidato da Ana", `${ANA.pub}:${ANA_PUB}`],
        ["Formato", "SDP"],
      ],
      highlight: ["sig"],
    },
    () => {
      c.send("lia", "sig", "oferta (SDP)", {
        dt: 20,
        via: ["natl"],
        detail: `candidato ${GW.wanIp}:${LIA_PUB}`,
      });
      c.send("sig", "ana", "oferta", { dt: 20, via: ["nata"] });
      c.send("ana", "sig", "resposta (SDP)", {
        dt: 20,
        via: ["nata"],
        role: "b",
        detail: `candidato ${ANA.pub}:${ANA_PUB}`,
      });
      c.send("sig", "lia", "resposta", { dt: 20, via: ["natl"], role: "b" });
    },
  );

  b.step(
    sym
      ? {
          id: "s4-furo",
          title: "O furo não abre",
          subtitle: "NAT simétrico: cada destino, uma porta",
          text: `No Laboratório você ligou o NAT simétrico na casa da Ana: ele usa uma porta pública diferente para cada destino. A porta que o STUN viu (${ANA_PUB}) só vale para o STUN; o pacote da Lia chega numa porta sem tradução e é descartado, e o da Ana sai por outra porta que a Lia não conhece. Os testes do ICE falham dos dois lados.`,
          facts: [
            ["Porta para o STUN", String(ANA_PUB)],
            ["Porta para a Lia", "outra, desconhecida"],
            ["Resultado", "testes falham"],
          ],
          highlight: ["nata"],
        }
      : {
          id: "s4-furo",
          title: "Furando os dois NATs",
          subtitle: "Testes do ICE nos dois sentidos",
          text: `Agora as duas mandam pedidos STUN **uma para a outra**, para os endereços públicos. O primeiro pacote da Lia abre uma tradução no NAT do campus para ${ANA.pub}:${ANA_PUB}; o da Ana faz o mesmo no NAT dela. Cada NAT passa a aceitar o que vem do outro lado, porque parece resposta a algo que saiu. É o *hole punching*.`,
          facts: [
            ["Lia testa", `${ANA.pub}:${ANA_PUB}`],
            ["Ana testa", `${GW.wanIp}:${LIA_PUB}`],
            ["Resultado", "caminho direto"],
          ],
          highlight: ["natl", "nata"],
          quiz: {
            kind: "choice",
            prompt: "Por que o pacote da Ana passa pelo NAT do campus nesse momento?",
            options: [
              "Porque o servidor do app abriu a porta",
              "Porque a Lia já tinha mandado um pacote para a Ana, criando a tradução",
              "Porque STUN atravessa qualquer NAT",
              "Porque a Ana usa IPv6",
            ],
            answer: 1,
            explain:
              "O NAT do campus viu um pacote sair da Lia para o endereço da Ana. Quando chega algo vindo **desse** endereço, ele trata como resposta e deixa passar. Por isso os testes vão nos dois sentidos.",
          },
        },
    () => {
      c.send("lia", "nata", "teste ICE", {
        dt: 30,
        via: ["natl"],
        frame: udpFrame(
          { src: GW.wanIp, dst: ANA.pub, sport: LIA_PUB, dport: ANA_PUB },
          stun({ response: false, tid: t2 }),
          { id: "f-ice-l", title: "Teste ICE da Lia", summary: "Abre o furo no NAT do campus." },
        ),
      });
      if (sym) {
        c.state("nata", "porta sem tradução: descarta", { dt: 0, tone: "bad", role: "warn" });
        c.send("ana", "natl", "teste ICE", {
          dt: 0,
          via: ["nata"],
          role: "b",
          detail: "sai por outra porta",
        });
        c.state("natl", "porta inesperada: descarta", { dt: 30, tone: "bad", role: "warn" });
      } else {
        c.state("nata", "ainda sem furo: descarta", { dt: 0, tone: "warn", role: "warn" });
        c.send("ana", "lia", "teste ICE", {
          dt: 0,
          via: ["nata", "natl"],
          role: "b",
          frame: udpFrame(
            { src: ANA.pub, dst: GW.wanIp, sport: ANA_PUB, dport: LIA_PUB },
            stun({ response: false, tid: t3 }),
            { id: "f-ice-a", title: "Teste ICE da Ana", summary: "Passa: parece resposta." },
          ),
        });
        c.send("lia", "ana", "teste ICE", { dt: 30, via: ["natl", "nata"], detail: "agora passa" });
        c.state("lia", "caminho direto ok", { dt: 30, tone: "good" });
      }
    },
  );

  b.step(
    sym
      ? {
          id: "s5-turn",
          title: "Plano B: TURN",
          subtitle: "Um servidor repassa a mídia",
          text: "Sem caminho direto, as duas usam o candidato de **revezamento**: um servidor TURN, com endereço público, recebe a mídia de uma e repassa à outra. Funciona com qualquer NAT, já que cada uma só fala com o servidor, mas custa banda do servidor e um pouco de atraso. A mídia continua cifrada de ponta a ponta: o TURN só vê bytes.",
          facts: [
            ["Caminho", "Lia → TURN → Ana"],
            ["Custo", "banda do servidor, mais atraso"],
            ["TURN lê a mídia?", "não, é cifrada"],
          ],
          highlight: ["stun"],
        }
      : {
          id: "s5-midia",
          quiz: {
            kind: "choice",
            prompt: "O servidor do aplicativo repassou a oferta e a resposta. Ele consegue ouvir a chamada?",
            options: [
              "Não: a mídia vai direta, cifrada com chaves que ele não tem",
              "Sim, porque toda a mídia passa por ele",
              "Sim, porque as chaves do SRTP iam na oferta",
            ],
            answer: 0,
            explain:
              "A oferta leva só a impressão digital do certificado, não as chaves. As chaves saem do DTLS feito direto entre as duas. Um servidor honesto não vê nada; um que trocasse as impressões digitais poderia se meter no meio.",
          },
          title: "Mídia direta e cifrada",
          subtitle: "DTLS e depois SRTP",
          text: "Pelo caminho que funcionou, as duas fazem um handshake **DTLS** (TLS sobre UDP) e conferem a impressão digital do certificado com a que veio na oferta. Dele saem as chaves do **SRTP**, que cifra cada pacote de áudio e vídeo. O servidor do aplicativo não está no caminho e não consegue ver a chamada, mesmo tendo passado os recados.",
          facts: [
            ["Caminho", "direto entre os NATs"],
            ["Cifra", "DTLS + SRTP"],
            ["Servidor do app vê a mídia?", "não"],
          ],
          highlight: ["lia", "ana"],
        },
    () => {
      if (sym) {
        c.send("lia", "stun", "mídia (SRTP)", {
          dt: 20,
          via: ["natl"],
          role: "crypto",
          frame: udpFrame(
            { src: GW.wanIp, dst: STUN_SRV.ip, sport: LIA_PUB, dport: STUN_SRV.port },
            opaque("srtp", "SRTP", 120, "vídeo cifrado"),
            { id: "f-turn", title: "Mídia para o TURN", summary: "Cifrada." },
          ),
        });
        c.send("stun", "ana", "mídia (SRTP)", { dt: 20, via: ["nata"], role: "crypto" });
      } else {
        c.send("lia", "ana", "DTLS", { dt: 30, via: ["natl", "nata"], role: "crypto" });
        c.send("ana", "lia", "DTLS", { dt: 30, via: ["nata", "natl"], role: "crypto" });
        c.send("lia", "ana", "vídeo (SRTP)", {
          dt: 30,
          via: ["natl", "nata"],
          role: "crypto",
          frame: udpFrame(
            { src: GW.wanIp, dst: ANA.pub, sport: LIA_PUB, dport: ANA_PUB },
            opaque("srtp", "SRTP", 120, "vídeo cifrado"),
            { id: "f-media", title: "Pacote de vídeo", summary: "Direto, cifrado." },
          ),
        });
      }
    },
  );

  return b.done({ sym: sym ? 1 : 0 });
}

const lesson: LessonModule = {
  meta: {
    slug: "webrtc",
    site: "redes",
    title: "WebRTC: chamada direta entre dois NATs",
    summary:
      "Sinalização, STUN, testes do ICE que furam os dois NATs, DTLS-SRTP e o TURN quando o furo não abre.",
    area: "Aplicação",
    refs: [
      { book: "tanenbaum-cn", chapter: 7, section: "7.4.4", note: "Streaming em tempo real", verified: true },
      { rfc: 8489, note: "STUN" },
      { rfc: 8445, note: "ICE" },
      { rfc: 8656, note: "TURN" },
      { rfc: 8827, note: "Arquitetura de segurança do WebRTC" },
    ],
    simplifications: [
      "Um par de candidatos testado; o ICE real testa vários pares em ordem de prioridade.",
      "As mensagens de sinalização aparecem sem conteúdo.",
      "Sem autenticação dos testes ICE (usuário e senha que vêm no SDP).",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [{ key: "simetrico", kind: "bool", label: "NAT da Ana é simétrico (uma porta por destino)" }],
  },
  build,
  intro: {
    text: "Numa videochamada, mandar a imagem por um servidor central gasta banda e aumenta o atraso. O ideal é ir direto de um computador ao outro, mas os dois estão atrás de NAT. Você vai ver como o WebRTC descobre endereços, abre caminho pelos dois NATs e o que faz quando não consegue.",
    facts: [
      ["Lia", "rede do campus"],
      ["Ana", "rede de casa"],
      ["Peças", "sinalização, STUN, ICE, TURN"],
    ],
  },
  outro: {
    title: "WebRTC em resumo",
    text: "Cada lado descobre o seu endereço público com STUN, troca candidatos pela sinalização e testa caminhos com ICE, o que abre os NATs. A mídia vai direta e cifrada, ou por um TURN quando o furo não abre.",
    facts: (run) => [["Caminho da mídia", run.stats.sym ? "pelo TURN" : "direto"]],
  },
  next: ["nat", "udp"],
};

export default lesson;
