import type { LessonModule, Params, SceneSpec } from "../../../contracts/types.ts";
import { type Fragment, fragment, lossAll, refragment } from "../../../sim/net/fragment.ts";
import { lessonBuilder } from "../../../sim/shared/builder.ts";
import { seqScene, talk } from "../../../sim/shared/seq.ts";
import { fragmentacao as practice } from "../practice.ts";

/**
 * IPv4 fragmentation: a datagram meets a smaller MTU at R2 and is cut, the fragments are cut
 * again at R3 (MTU 576), only the destination reassembles, and with DF the source discovers the
 * path MTU from the ICMP messages.
 */
export const DEFAULTS = { tamanho: 4000, mtu: 1500 };
const HDR = 20;
const SMALL = 576;
const LOSS = 0.01;

function clamp(p: Params) {
  const total = Math.min(9000, Math.max(600, Math.round(Number(p.tamanho ?? DEFAULTS.tamanho))));
  const mtu = Math.min(1500, Math.max(SMALL, Math.round(Number(p.mtu ?? DEFAULTS.mtu))));
  return { total, mtu };
}

function plan(p: Params) {
  const { total, mtu } = clamp(p);
  const first =
    total > mtu ? fragment(total, HDR, mtu) : [{ offset: 0, data: total - HDR, total, mf: false }];
  const second = first.flatMap((f) => refragment(f, HDR, SMALL));
  return { total, mtu, first, second };
}

function scene(p: Params): SceneSpec {
  const { mtu, first, second } = plan(p);
  const rows = Math.max(first.length, second.length);
  const base = seqScene(
    [
      { id: "lia", kind: "laptop", label: "Lia", sub: "192.0.2.10" },
      { id: "r1", kind: "router", label: "R1", sub: "MTU 9000" },
      { id: "r2", kind: "router", label: "R2", sub: `MTU ${mtu}` },
      { id: "r3", kind: "router", label: "R3", sub: `MTU ${SMALL}` },
      { id: "srv", kind: "server", label: "Biblioteca", sub: "203.0.113.5" },
    ],
    {
      height: 330 + rows * 22,
      widgets: [
        {
          kind: "table",
          id: "frag",
          title: `Depois de R2 (MTU ${mtu})`,
          at: [20, 240],
          columns: ["Frag.", "Dados", "Desloc.", "MF"],
          widths: [70, 90, 90, 50],
          rows: first.length,
        },
        {
          kind: "table",
          id: "frag2",
          title: `Depois de R3 (MTU ${SMALL})`,
          at: [350, 240],
          columns: ["Frag.", "Dados", "Desloc.", "MF"],
          widths: [70, 90, 90, 50],
          rows: second.length,
        },
        { kind: "counter", id: "perda", title: "Chance de perder o datagrama", at: [700, 240] },
      ],
    },
  );
  return base;
}

const pct = (x: number) => `${String(Math.round(x * 10000) / 100).replace(".", ",")}%`;
const row = (f: Fragment, i: number) => [String(i + 1), String(f.data), String(f.offset), f.mf ? "1" : "0"];

export function build(p: Params) {
  const { total, mtu, first, second } = plan(p);
  const b = lessonBuilder();
  const c = talk(b, { lia: "Lia", r1: "R1", r2: "R2", r3: "R3", srv: "Biblioteca" });
  const data = total - HDR;
  const chunk = (first[0] as Fragment).data;
  const last = first[first.length - 1] as Fragment;
  const lost1 = lossAll(LOSS, first.length);
  const lost2 = lossAll(LOSS, second.length);
  const split = first.filter((f) => f.total > SMALL).length;
  const piece = second[1] ?? (second[0] as Fragment);
  const pmtu = [mtu, SMALL].filter((m, i, a) => total > m && a.indexOf(m) === i && (i === 0 || m < mtu));
  const notes: string[] = [];
  if (total <= mtu) notes.push(`O datagrama de ${total} bytes cabe na MTU ${mtu}: R2 não fragmenta, só R3.`);
  if (mtu === SMALL) notes.push(`Com MTU ${SMALL} em R2, os fragmentos já cabem em R3, que não corta nada.`);

  b.step(
    {
      id: "s1-mtu",
      title: "Um datagrama grande demais",
      subtitle: `${total} bytes contra MTU ${mtu}`,
      text: `Lia manda à biblioteca um [[datagrama]] IPv4 de ${total} bytes, ${HDR} de cabeçalho e ${data} de dados. O primeiro enlace aceita quadros grandes e R1 repassa sem problema. Mas a saída de R2 tem [[mtu]] ${mtu} bytes, e depois de R3 há um enlace antigo de ${SMALL}. Um roteador IPv4 que recebe um datagrama maior que a saída tem duas opções: descartar ou cortar em pedaços.`,
      facts: [
        ["Datagrama", `${total} bytes`],
        ["Cabeçalho", `${HDR} bytes`],
        ["MTUs no caminho", `9000, ${mtu}, ${SMALL}`],
      ],
      highlight: ["lia", "r1", "r2"],
    },
    () => {
      c.send("lia", "r1", `datagrama ${total} B`, { role: "a" });
      c.send("r1", "r2", `datagrama ${total} B`, { role: "a", detail: "cabe no enlace de 9000" });
      c.state("r2", total > mtu ? `não cabe em ${mtu}` : `cabe em ${mtu}`, {
        tone: total > mtu ? "warn" : "good",
        label: "MTU da saída",
      });
    },
  );

  b.step(
    {
      id: "s2-cortar",
      title: "Cortar em fragmentos",
      subtitle: `${first.length} fragmentos`,
      text: `R2 faz a [[fragmentacao-ip]]. Cada fragmento leva um cabeçalho de ${HDR} bytes, e os dados de todos menos o último precisam ser múltiplo de 8: até ${chunk} bytes. Os ${data} bytes viram ${first.map((f) => f.data).join(", ")}. O deslocamento diz onde cada pedaço começa, contado em blocos de 8 bytes: ${first.map((f) => f.offset).join(", ")}. O bit MF, mais fragmentos, vai ligado em todos menos no último, e todos levam a mesma identificação.`,
      facts: [
        ["Dados por fragmento", `até ${chunk} bytes`],
        ["Deslocamentos", first.map((f) => f.offset).join(", ")],
        ["Último", `${last.total} bytes, MF = 0`],
      ],
      highlight: ["r2"],
      quiz: {
        kind: "number",
        prompt: `Qual é o deslocamento, em blocos de 8 bytes, do último fragmento (os anteriores levam ${chunk} bytes de dados cada)?`,
        answer: last.offset,
        explain: `Ele começa no byte ${last.offset * 8} dos dados: ${last.offset * 8} / 8 = ${last.offset}.`,
      },
    },
    () => {
      first.forEach((f, i) => {
        c.send("r2", "r3", `fragmento ${i + 1}`, {
          role: f.mf ? "a" : "b",
          detail: `deslocamento ${f.offset}, MF ${f.mf ? 1 : 0}`,
          dt: i === 0 ? 1 : 0,
        });
        c.row("frag", i, row(f, i), { dt: 0, mark: f.mf ? "new" : "hit" });
      });
    },
  );

  b.step(
    {
      id: "s3-de-novo",
      title: "Cortar de novo",
      subtitle: `${first.length} viram ${second.length}`,
      text: `Em R3, a saída é de ${SMALL} bytes e ${split} dos fragmentos não cabem. R3 os corta de novo, sem saber que já eram pedaços: cada um vira pedaços de até ${SMALL - HDR - ((SMALL - HDR) % 8)} bytes de dados. Os deslocamentos continuam contados a partir do datagrama original, e só o último pedaço do último fragmento sai com MF = 0. A biblioteca recebe ${second.length} pedaços e não precisa saber em quantos roteadores eles foram cortados.`,
      facts: [
        ["Cortados de novo", String(split)],
        ["Pedaços", String(second.length)],
        ["Deslocamento", "do datagrama original"],
      ],
      highlight: ["r3"],
      quiz: {
        kind: "choice",
        prompt: `O segundo pedaço que sai de R3 tem deslocamento ${piece.offset}. A partir de onde esse número é contado?`,
        options: [
          "Do começo dos dados do datagrama original",
          "Do começo do fragmento que R3 recebeu",
          "Do começo do quadro em R3",
        ],
        answer: 0,
        explain:
          "O destino monta tudo num só espaço, o do datagrama original; por isso R3 soma o deslocamento do fragmento que recebeu ao de cada pedaço.",
      },
    },
    () => {
      second.forEach((f, i) => {
        c.send("r3", "srv", `pedaço ${i + 1}`, {
          role: f.mf ? "a" : "b",
          detail: `deslocamento ${f.offset}, MF ${f.mf ? 1 : 0}`,
          dt: i === 0 ? 1 : 0,
        });
        c.row("frag2", i, row(f, i), { dt: 0, mark: f.mf ? "new" : "hit" });
      });
    },
  );

  b.step(
    {
      id: "s4-remontar",
      title: "Só o destino remonta",
      subtitle: `${pct(lost2)} de chance de perder tudo`,
      text: `Nenhum roteador junta os pedaços: eles podem até seguir caminhos diferentes. A biblioteca guarda os que chegam e, com o último e todos os buracos preenchidos, monta o datagrama. Se um só se perde, os outros são descartados depois de um tempo e tudo precisa ser reenviado. Com ${pct(LOSS)} de perda por pacote, a chance de perder o datagrama é ${pct(lost1)} com ${first.length} fragmentos e ${pct(lost2)} com ${second.length}.`,
      facts: [
        ["Quem remonta", "o destino"],
        ["Perda por pacote", pct(LOSS)],
        ["Perda do datagrama", pct(lost2)],
      ],
      highlight: ["srv"],
    },
    () => {
      c.state("srv", "remonta pelos deslocamentos", { tone: "good", label: "datagrama completo" });
      c.count("perda", pct(lost2), { role: "warn", label: `${pct(lost2)} com ${second.length} pedaços` });
    },
  );

  b.step(
    {
      id: "s5-pmtud",
      title: "Descobrir a MTU do caminho",
      subtitle: `${pmtu.length} avisos ICMP`,
      text: `Por isso a prática hoje é evitar fragmentar. Lia liga o bit DF, não fragmentar. Cada roteador cuja saída é pequena demais descarta o datagrama e devolve um [[icmp]] com a MTU da saída. Lia reduz o tamanho e tenta de novo, até passar: é a [[descoberta-de-mtu]], aqui com ${pmtu.length} avisos, terminando em ${Math.min(mtu, SMALL)} bytes. No IPv6, roteadores nunca fragmentam. Um firewall que bloqueia esse ICMP quebra conexões de um jeito difícil de diagnosticar.`,
      facts: [
        ["Bit", "DF = 1"],
        ["Avisos", pmtu.map((m) => `MTU ${m}`).join(", ") || "nenhum"],
        ["IPv6", "só a origem fragmenta"],
      ],
      highlight: ["lia", "r2", "r3"],
    },
    () => {
      let size = total;
      c.send("lia", "r1", `${size} B, DF`, { role: "a" });
      for (const m of pmtu) {
        const at = m === SMALL && m < mtu ? "r3" : m === mtu ? "r2" : "r3";
        c.send(at, "lia", `ICMP: MTU ${m}`, { role: "warn", detail: "fragmentação necessária" });
        size = m;
        c.send("lia", "r1", `${size} B, DF`, { role: "a" });
      }
      c.send("r1", "srv", `datagramas de ${size} B`, {
        role: "b",
        via: ["r2", "r3"],
        detail: "cabem no caminho todo",
      });
    },
  );

  return b.done(
    {
      offsets: first.map((f) => f.offset).join(","),
      sizes: first.map((f) => f.total).join(","),
      second: second.map((f) => f.offset).join(","),
      lost: pct(lost2),
    },
    notes,
  );
}

const lesson: LessonModule = {
  meta: {
    slug: "fragmentacao",
    site: "redes",
    title: "Fragmentação IP e descoberta de MTU",
    summary:
      "Um datagrama de 4000 bytes cortado duas vezes, o deslocamento em blocos de 8 e os ICMP que evitam fragmentar.",
    area: "Rede",
    refs: [
      {
        book: "tanenbaum-cn",
        chapter: 5,
        section: "5.5.6",
        note: "Suporte a diferentes tamanhos de pacotes: fragmentação",
        verified: true,
      },
      { book: "tanenbaum-cn", chapter: 5, section: "5.7.1", note: "O cabeçalho IPv4", verified: true },
      { rfc: 791, note: "Internet Protocol: campos de fragmentação" },
      { rfc: 1191, note: "Path MTU Discovery" },
    ],
    simplifications: [
      "O cabeçalho não tem opções; com opções, nem todas são copiadas para os fragmentos.",
      "A perda dos fragmentos é independente, 1% cada.",
    ],
  },
  scene,
  params: {
    defaults: DEFAULTS,
    fields: [
      { key: "tamanho", kind: "int", label: "Tamanho do datagrama (bytes)", min: 600, max: 9000, step: 100 },
      { key: "mtu", kind: "int", label: "MTU da saída de R2 (bytes)", min: 576, max: 1500, step: 4 },
    ],
  },
  build,
  intro: {
    text: "Cada enlace tem um tamanho máximo de quadro, e um datagrama que atravessa a Internet passa por vários. Você vai ver o que os roteadores fazem quando o datagrama não cabe, inclusive cortar o que já foi cortado, e por que os sistemas hoje preferem descobrir o limite antes.",
    facts: [
      ["Datagrama", `${DEFAULTS.tamanho} bytes`],
      ["MTUs", `${DEFAULTS.mtu} e ${SMALL}`],
      ["Versão", "IPv4"],
    ],
  },
  outro: {
    title: "Fragmentação em resumo",
    text: "Um roteador IPv4 corta um datagrama grande em fragmentos com deslocamento em blocos de 8 e o bit MF; outro roteador pode cortá-los de novo, sempre contando a partir do original. Só o destino remonta, e perder um pedaço perde tudo. Com DF e os ICMP de volta, a origem descobre a MTU e envia do tamanho certo.",
    facts: (run) => [
      ["Deslocamentos em R2", String(run.stats.offsets)],
      ["Deslocamentos em R3", String(run.stats.second)],
      ["Perda do datagrama", String(run.stats.lost)],
    ],
  },
  next: ["ping-traceroute", "ipv6-slaac"],
  practice,
};

export default lesson;
