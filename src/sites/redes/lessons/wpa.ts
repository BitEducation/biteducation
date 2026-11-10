import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import {
  ALPHABETS,
  type Alphabet,
  CCMP_HEADER,
  CCMP_MIC,
  ccmpFrame,
  expectedSeconds,
  human,
  KEYS,
  PBKDF2_ROUNDS,
  sci,
  space,
} from "../../../sim/net/wpa.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { talk } from "../../../sim/shared/seq.ts";

/**
 * Wi-Fi security for a home network: what the air exposes, the PMK and the four-way handshake,
 * CCMP frames with packet numbers, why a short WPA2 passphrase falls to offline guessing, and how
 * WPA3's SAE takes that away. Defensive framing: no tooling, only the arithmetic.
 */
export const DEFAULTS = { tamanho: 8, alfabeto: "minusculas" };
const SSID = "casa";
const PAYLOAD = 1500;
/** Assumed rates: a GPU against PBKDF2 offline, and an AP that answers a few SAE exchanges per second. */
const OFFLINE_RATE = 1_000_000;
const ONLINE_RATE = 10;

const ALPHA_LABEL: Record<Alphabet, string> = {
  minusculas: "só minúsculas",
  alfanum: "letras e dígitos",
  ascii: "teclado inteiro",
};

/** Counters are narrow: past a million, only the order of magnitude ("~10²⁵ anos"). */
const brief = (s: string) => s.replace(/^[\d,]+ × /, "~");

function clamp(p: Params) {
  const len = Math.min(20, Math.max(8, Math.round(Number(p.tamanho ?? DEFAULTS.tamanho))));
  const raw = String(p.alfabeto ?? DEFAULTS.alfabeto);
  const alpha: Alphabet = raw in ALPHABETS ? (raw as Alphabet) : "minusculas";
  return { len, alpha };
}

function scene(): SceneSpec {
  return {
    viewBox: [960, 600],
    zones: [
      { id: "z-casa", title: `Rede Wi-Fi "${SSID}"`, rect: { x: 20, y: 60, w: 600, h: 260 }, tone: "lan" },
    ],
    nodes: [
      { id: "cel", kind: "laptop", label: "Celular", sub: "cliente", at: [130, 190] },
      { id: "ap", kind: "router", label: "Ponto de acesso", sub: `SSID ${SSID}`, at: [480, 190] },
      { id: "viz", kind: "attacker", label: "Rádio por perto", sub: "só escuta", at: [800, 190] },
    ],
    links: [
      { id: "l-ar", from: "cel", to: "ap", style: "dashed" },
      { id: "l-viz", from: "ap", to: "viz", style: "dashed" },
    ],
    widgets: [
      {
        kind: "table",
        id: "chaves",
        title: "Chaves: quem gera e para quê",
        at: [40, 370],
        columns: ["Chave", "Bits", "De onde vem"],
        widths: [60, 50, 230],
        rows: KEYS.length,
      },
      { kind: "counter", id: "senhas", title: "Senhas possíveis", at: [440, 370] },
      { kind: "counter", id: "offline", title: "Tempo: WPA2 offline", at: [640, 370] },
      { kind: "counter", id: "quadro", title: "Quadro cifrado", at: [440, 470] },
      { kind: "counter", id: "online", title: "Tempo: WPA3 (SAE)", at: [640, 470] },
    ],
  };
}

export function build(p: Params) {
  const { len, alpha } = clamp(p);
  const b = lessonBuilder();
  const c = talk(b, { cel: "celular", ap: "ponto de acesso", viz: "rádio por perto" }, (t) => String(t));

  const combos = space(len, alpha);
  const offline = expectedSeconds(len, alpha, OFFLINE_RATE);
  const online = expectedSeconds(len, alpha, ONLINE_RATE);
  const frame = ccmpFrame(PAYLOAD);
  const keyRow = (i: number, dt = 0) => {
    const k = KEYS[i];
    if (k) c.row("chaves", i, [k.name, String(k.bits), k.from], { dt, mark: "new", role: "crypto" });
  };

  b.step(
    {
      id: "s1-ar",
      title: "O ar é de todos",
      subtitle: "rede aberta",
      text: `Num cabo, só quem está ligado a ele recebe os sinais. No Wi-Fi, cada quadro é uma onda de rádio que chega a qualquer antena por perto, inclusive a do vizinho e a de quem está na calçada. Numa rede aberta, sem cifra, esse rádio lê endereços, sites visitados e tudo que não estiver dentro de [[tls|TLS]]. Por isso a proteção do Wi-Fi precisa de duas coisas: provar que o celular conhece a senha e cifrar cada quadro.`,
      facts: [
        ["Meio", "rádio, compartilhado"],
        ["Rede aberta", "quadros legíveis"],
        ["SSID", SSID],
      ],
      highlight: ["viz"],
    },
    () => {
      c.send("cel", "ap", "quadro", { role: "a", what: "quadro em claro", detail: "DNS, HTTP, endereços" });
      c.send("cel", "viz", "cópia", {
        dt: 0,
        via: ["ap"],
        role: "bad",
        what: "o mesmo sinal chega ao vizinho",
      });
      c.state("viz", "lê tudo", { tone: "bad", role: "bad", label: "rede aberta: conteúdo legível" });
    },
  );

  b.step(
    {
      id: "s2-pmk",
      title: "Da senha à PMK",
      subtitle: `${PBKDF2_ROUNDS} rodadas de PBKDF2`,
      text: `No [[wpa|WPA2]] pessoal, todos que conhecem a senha calculam a mesma chave mestra, a [[pmk|PMK]]: 256 bits saídos da função PBKDF2, que mistura a senha com o nome da rede, "${SSID}", e repete o embaralhamento ${PBKDF2_ROUNDS} vezes. O SSID entra na conta para que a mesma senha dê chaves diferentes em redes diferentes; as repetições tornam cada tentativa de adivinhar mais cara. A PMK nunca é transmitida: celular e ponto de acesso a calculam cada um do seu lado.`,
      facts: [
        ["PMK", "256 bits"],
        ["Entradas", `senha + "${SSID}"`],
        ["Rodadas", String(PBKDF2_ROUNDS)],
      ],
      highlight: ["cel", "ap"],
    },
    () => {
      c.state("cel", "PMK", { role: "crypto", label: "calcula a PMK" });
      c.state("ap", "PMK", { dt: 0, role: "crypto", label: "calcula a PMK" });
      keyRow(0);
    },
  );

  b.step(
    {
      id: "s3-quatro",
      title: "As quatro mensagens",
      subtitle: "nonces, MIC e GTK",
      text: `No [[handshake-de-quatro-vias]], o ponto de acesso manda um número aleatório, o ANonce. O celular sorteia o seu, o SNonce, e calcula a PTK a partir da PMK, dos dois nonces e dos dois endereços MAC. Ele responde com o SNonce e um MIC, uma assinatura feita com parte da PTK: o ponto de acesso refaz a conta e confere. A terceira mensagem traz a GTK, chave dos quadros em broadcast, cifrada; a quarta confirma. A senha nunca passou pelo ar.`,
      facts: [
        ["Mensagens", "4"],
        ["PTK", "384 bits, por sessão"],
        ["Prova", "MIC"],
      ],
      highlight: ["cel", "ap"],
      quiz: {
        kind: "choice",
        prompt: "Como o ponto de acesso sabe que o celular conhece a senha, se ela não é enviada?",
        options: [
          "O MIC da mensagem 2 só confere se a PTK veio da mesma PMK",
          "O celular manda a PMK cifrada na mensagem 2",
          "O ANonce só pode ser lido por quem sabe a senha",
        ],
        answer: 0,
        explain:
          "O MIC é feito com a KCK, parte da PTK; uma senha errada gera outra PMK, outra PTK e um MIC que não confere.",
      },
    },
    () => {
      c.send("ap", "cel", "1: ANonce", { role: "ctrl", what: "mensagem 1", detail: "ANonce" });
      c.state("cel", "PTK", { role: "crypto", label: "PTK = PRF(PMK, nonces, MACs)" });
      for (let i = 1; i <= 4; i++) keyRow(i);
      c.send("cel", "ap", "2: SNonce + MIC", {
        role: "ctrl",
        what: "mensagem 2",
        detail: "SNonce, MIC com a KCK",
      });
      c.state("ap", "MIC confere", { tone: "good", role: "crypto", label: "mesma PTK: senha certa" });
      c.send("ap", "cel", "3: GTK + MIC", {
        role: "crypto",
        what: "mensagem 3",
        detail: "GTK cifrada com a KEK",
      });
      keyRow(5);
      c.send("cel", "ap", "4: ok", {
        role: "ctrl",
        what: "mensagem 4",
        detail: "confirma; chaves instaladas",
      });
    },
  );

  b.step(
    {
      id: "s4-quadros",
      title: "Cada quadro, cifrado",
      subtitle: `${PAYLOAD} → ${frame} bytes`,
      text: `Com a TK instalada, cada quadro de dados é cifrado com AES no modo CCMP, uma cifra [[aead]]. Ele ganha ${CCMP_HEADER} bytes de cabeçalho, com um número de pacote que só cresce, e ${CCMP_MIC} bytes de verificação no fim: ${PAYLOAD} bytes de dados viram ${frame}. O rádio vizinho ainda recebe o sinal, mas só vê bytes embaralhados. Se ele regravar e reenviar um quadro antigo, o número de pacote repetido denuncia a cópia, e o ponto de acesso a descarta.`,
      facts: [
        ["Cabeçalho CCMP", `${CCMP_HEADER} bytes`],
        ["Verificação", `${CCMP_MIC} bytes`],
        ["Quadro", `${frame} bytes`],
      ],
      highlight: ["ap"],
      quiz: {
        kind: "number",
        prompt: `Quantos bytes ocupa, depois do CCMP, um quadro com ${PAYLOAD} bytes de dados (sem contar o cabeçalho 802.11)?`,
        answer: frame,
        unit: "bytes",
        explain: `${PAYLOAD} + ${CCMP_HEADER} + ${CCMP_MIC} = ${frame} bytes.`,
      },
    },
    () => {
      c.send("cel", "ap", "PN 1", { role: "crypto", what: "dados cifrados", detail: "número de pacote 1" });
      c.send("cel", "ap", "PN 2", { role: "crypto", what: "dados cifrados", detail: "número de pacote 2" });
      c.state("viz", "só ruído", { tone: "warn", role: "warn", label: "recebe, mas não lê" });
      c.send("viz", "ap", "PN 1 de novo", {
        role: "bad",
        lost: true,
        what: "quadro antigo reenviado",
        detail: "número repetido: descartado",
      });
      c.count("quadro", `${frame} B`, { label: `${frame} bytes por quadro` });
    },
  );

  const strong = offline >= 100 * 365 * 86400;
  b.step(
    {
      id: "s5-curta",
      title: "Senha curta não aguenta",
      subtitle: `${human(offline)} em média`,
      text: `O ponto fraco do WPA2 pessoal é a senha. Quem grava um handshake tem nonces, endereços e o MIC, e pode testar senhas longe da rede: para cada palpite, calcula PMK, PTK e MIC e compara. O ponto de acesso nunca fica sabendo. Uma senha de ${len} caracteres (${ALPHA_LABEL[alpha]}) tem ${sci(combos)} combinações; supondo um milhão de palpites por segundo, acha-se a certa em ${human(offline)}, em média. ${strong ? "Esse tamanho já resiste." : "A defesa é uma senha longa e aleatória."}`,
      facts: [
        ["Combinações", sci(combos)],
        ["Palpites por segundo", "1 milhão"],
        ["Tempo médio", human(offline)],
      ],
      highlight: ["viz"],
    },
    () => {
      c.state("viz", "testa senhas", {
        tone: "bad",
        role: "bad",
        label: "palpites offline, sem tocar no AP",
      });
      c.count("senhas", brief(sci(combos)), { label: `${sci(combos)} senhas possíveis` });
      c.count("offline", brief(human(offline)), { label: `WPA2: ${human(offline)} em média` });
    },
  );

  b.step(
    {
      id: "s6-wpa3",
      title: "WPA3 e o SAE",
      subtitle: `${human(online)} em média`,
      text: `O WPA3 troca a PMK fixa pelo [[sae|SAE]], uma troca de chaves que depende da senha, mas cuja gravação não serve para testar palpites: cada tentativa exige uma conversa nova com o ponto de acesso, que pode limitar o ritmo. A ${sci(ONLINE_RATE)} tentativas por segundo, a mesma senha leva ${human(online)}. Cada sessão tem chaves próprias, com [[sigilo-futuro]]. O WPA3 também exige [[pmf|PMF]]: quadros de gerência, como o de desconexão, passam a ser autenticados e não podem ser forjados.`,
      facts: [
        ["Palpites", "só online"],
        ["Tempo médio", human(online)],
        ["PMF", "obrigatório"],
      ],
      highlight: ["ap"],
      quiz: {
        kind: "choice",
        prompt: "O que muda para quem grava a troca de chaves de uma rede WPA3?",
        options: [
          "A gravação não permite testar senhas; cada palpite exige falar com o ponto de acesso",
          "Nada: basta testar senhas mais rápido",
          "A senha aparece cifrada e pode ser decifrada depois",
        ],
        answer: 0,
        explain:
          "No SAE, um palpite só pode ser verificado numa troca ao vivo, que o ponto de acesso vê e pode limitar.",
      },
    },
    () => {
      c.state("ap", "SAE", { role: "crypto", label: "troca SAE" });
      c.send("cel", "ap", "commit", { role: "crypto", what: "SAE: commit" });
      c.send("ap", "cel", "commit", { role: "crypto", what: "SAE: commit" });
      c.send("cel", "ap", "confirm", { role: "crypto", what: "SAE: confirm" });
      c.send("ap", "cel", "confirm", {
        role: "crypto",
        what: "SAE: confirm",
        detail: "PMK nova, só desta sessão",
      });
      c.state("viz", "gravação inútil", { tone: "good", role: "muted", label: "não dá para testar offline" });
      c.count("online", brief(human(online)), { label: `WPA3: ${human(online)} em média` });
    },
  );

  return b.done({
    combos: sci(combos),
    offline: human(offline),
    online: human(online),
    frame,
  });
}

const lesson: LessonModule = {
  meta: {
    slug: "wpa",
    site: "redes",
    title: "WPA2 e WPA3: segurança no Wi-Fi",
    summary:
      "Por que o rádio exige cifra, como a senha vira PMK, as quatro mensagens que geram a PTK sem expor a senha, o CCMP em cada quadro, o custo de adivinhar uma senha curta no WPA2 e o que o SAE do WPA3 muda.",
    area: "Segurança",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 8,
        section: "8.10.3",
        note: "Segurança em redes sem fio",
        verified: true,
      },
      { url: "https://www.wi-fi.org/discover-wi-fi/security", title: "Wi-Fi Alliance: Wi-Fi CERTIFIED WPA3" },
    ],
    simplifications: [
      `As velocidades de ${sci(OFFLINE_RATE)} palpites por segundo offline e ${ONLINE_RATE} por segundo no SAE são suposições de ordem de grandeza.`,
      "As senhas têm exatamente o tamanho escolhido e são sorteadas de forma uniforme; senhas de pessoas são bem mais previsíveis.",
      "O WPA3 aparece só no modo pessoal (SAE); o modo empresarial, com 802.1X, fica de fora.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "tamanho", kind: "int", label: "Tamanho da senha", min: 8, max: 20 },
      {
        key: "alfabeto",
        kind: "choice",
        label: "Caracteres da senha",
        options: [
          { value: "minusculas", label: "Só minúsculas (26)" },
          { value: "alfanum", label: "Letras e dígitos (62)" },
          { value: "ascii", label: "Teclado inteiro (95)" },
        ],
      },
    ],
  },
  build,
  intro: {
    text: "Tudo que um celular manda pelo Wi-Fi chega também à antena de quem está por perto. Você vai ver como o WPA2 prova que o celular sabe a senha sem enviá-la, como cifra cada quadro, quanto tempo uma senha curta resiste e o que o WPA3 corrige.",
    facts: [
      ["Rede", SSID],
      ["Handshake", "4 mensagens"],
      ["Cifra", "AES-CCMP"],
    ],
  },
  outro: {
    title: "Wi-Fi seguro em resumo",
    text: "No WPA2 pessoal, a senha e o SSID geram a PMK; o handshake de quatro vias deriva uma PTK por sessão e prova a senha com um MIC; o CCMP cifra cada quadro e rejeita repetições. A fraqueza é a senha curta, que pode ser testada offline a partir de um handshake gravado. O WPA3 usa o SAE, que só permite palpites ao vivo, dá sigilo futuro e exige quadros de gerência protegidos.",
    facts: (run) => [
      ["Combinações", String(run.stats.combos)],
      ["WPA2 offline", String(run.stats.offline)],
      ["WPA3", String(run.stats.online)],
    ],
  },
  next: ["switch-vlan", "tls13", "wireguard"],
};

export default lesson;
