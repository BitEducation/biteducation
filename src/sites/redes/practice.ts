import type { Practice } from "../../contracts/types.ts";
import { pureAloha } from "../../sim/net/aloha.ts";
import { block, toIp } from "../../sim/net/cidr.ts";
import { encode, str, toBits } from "../../sim/net/crc.ts";
import { modpow, share, shared } from "../../sim/net/dh.ts";
import { fragment } from "../../sim/net/fragment.ts";
import { bitStuff, byteStuff, hex as fhex } from "../../sim/net/framing.ts";
import { espSize } from "../../sim/net/ipsec.ts";
import { bitmapEfficiency, countdownEfficiency } from "../../sim/net/mac-free.ts";
import { exchange } from "../../sim/net/ntp.ts";
import { buildTime } from "../../sim/net/onion.ts";
import { peerToPeer } from "../../sim/net/p2p.ts";
import { nyquist, shannon } from "../../sim/net/physical.ts";
import { raceChance, TXID_SPACE } from "../../sim/net/poison.ts";
import { prob } from "../../sim/net/red.ts";
import { gcd, keys } from "../../sim/net/rsa.ts";
import { big, dice, num } from "../shared/practice-kit.ts";

export const subRedes: Practice[] = [
  {
    title: "Endereços utilizáveis",
    make(seed) {
      const d = dice(seed);
      const p = d.int(20, 30);
      const total = 2 ** (32 - p);
      return {
        prompt: `Quantos endereços podem ser dados a máquinas numa rede /${p}?`,
        answer: total - 2,
        explain: `Sobram ${32 - p} bits para a máquina: 2^${32 - p} = ${big(total)} endereços. Tirando o da rede (tudo zero) e o de broadcast (tudo um), ficam ${big(total - 2)}.`,
      };
    },
  },
  {
    title: "Último octeto do broadcast",
    make(seed) {
      const d = dice(seed);
      const p = d.int(25, 30);
      const addr = ((192 << 24) | (168 << 16) | (d.int(0, 255) << 8) | d.int(1, 254)) >>> 0;
      const b = block(addr, p);
      return {
        prompt: `A máquina ${toIp(addr)}/${p} manda um broadcast para a própria sub-rede. Qual é o último número do endereço de broadcast?`,
        answer: b.broadcast & 255,
        explain: `A máscara /${p} deixa ${32 - p} bits para a máquina. A rede começa em ${toIp(b.network)} e tem ${2 ** (32 - p)} endereços; o broadcast é o último deles, ${toIp(b.broadcast)}.`,
      };
    },
  },
];

const GENS = [
  [1, 0, 1, 1],
  [1, 1, 0, 1],
  [1, 0, 0, 1, 1],
];
export const crc: Practice[] = [
  {
    title: "Resto da divisão",
    make(seed) {
      const d = dice(seed);
      const gen = d.pick(GENS);
      const data = toBits(d.int(9, 63), 6);
      const { remainder } = encode(data, gen);
      const value = remainder.reduce((a, b) => a * 2 + b, 0);
      return {
        prompt: `Os dados são ${str(data)} e o gerador é ${str(gen)}. Qual é o CRC, os ${gen.length - 1} bits que vão no fim do quadro? Responda o valor desses bits em decimal.`,
        answer: value,
        explain: `Acrescente ${gen.length - 1} zeros aos dados e divida por ${str(gen)} com XOR, linha a linha. O resto é ${str(remainder)}, que vale ${value}. O quadro enviado é ${str(data)}${str(remainder)}.`,
      };
    },
  },
];

export const camadaFisica: Practice[] = [
  {
    title: "Limite de Nyquist",
    make(seed) {
      const d = dice(seed);
      const band = d.pick([3, 4, 6, 8, 10, 20]);
      const levels = d.pick([2, 4, 8, 16]);
      const c = nyquist(band, levels);
      return {
        prompt: `Um canal sem ruído tem banda de ${band} kHz e o transmissor usa ${levels} níveis de sinal. Qual a taxa máxima, em kbit/s?`,
        answer: c,
        unit: "kbit/s",
        explain: `Nyquist: 2 × banda × log2(níveis) = 2 × ${band} × ${Math.log2(levels)} = ${num(c)} kbit/s. Mais níveis põem mais bits em cada símbolo.`,
      };
    },
  },
  {
    title: "Limite de Shannon",
    make(seed) {
      const d = dice(seed);
      const band = d.pick([1, 2, 3, 4, 5]);
      const db = d.pick([10, 20, 30, 40]);
      const c = shannon(band, db);
      const snr = 10 ** (db / 10);
      return {
        prompt: `Um canal tem banda de ${band} MHz e relação sinal-ruído de ${db} dB. Qual a capacidade máxima, em Mbit/s? (uma casa decimal basta)`,
        answer: c,
        tolerance: 0.1,
        unit: "Mbit/s",
        explain: `${db} dB é uma razão de ${big(snr)}. Shannon: banda × log2(1 + S/N) = ${band} × log2(${big(1 + snr)}) ≈ ${num(c, 1)} Mbit/s. Nenhum código passa disso.`,
      };
    },
  },
];

export const ftp: Practice[] = [
  {
    title: "Porta do PASV",
    make(seed) {
      const d = dice(seed);
      const hi = d.int(150, 250);
      const lo = d.int(0, 255);
      return {
        prompt: `O servidor responde 227 Entering Passive Mode (192,0,2,21,${hi},${lo}). Em que porta ele espera a conexão de dados?`,
        answer: hi * 256 + lo,
        explain: `Os dois últimos números são a porta em dois bytes: ${hi} × 256 + ${lo} = ${hi * 256 + lo}.`,
      };
    },
  },
];

export const ntp: Practice[] = [
  {
    title: "Deslocamento θ",
    make(seed) {
      const d = dice(seed);
      const err = d.pick([-1, 1]) * d.int(5, 60) * 10;
      const out = d.int(5, 40);
      const back = out;
      const x = exchange(10_000, err, out, back, d.int(1, 3));
      return {
        prompt: `T1 = ${x.t1}, T2 = ${x.t2}, T3 = ${x.t3}, T4 = ${x.t4} (ms; T1 e T4 no relógio do cliente). Quanto o cliente deve somar ao relógio, em ms?`,
        answer: x.offset,
        unit: "ms",
        explain: `θ = ((T2 − T1) + (T3 − T4)) / 2 = ((${x.t2 - x.t1}) + (${x.t3 - x.t4})) / 2 = ${num(x.offset)} ms. Os tempos de viagem, iguais nos dois sentidos, se cancelam.`,
      };
    },
  },
  {
    title: "Atraso de ida e volta",
    make(seed) {
      const d = dice(seed);
      const x = exchange(5_000, d.int(-300, 300), d.int(5, 60), d.int(5, 60), d.int(1, 4));
      return {
        prompt: `T1 = ${x.t1}, T2 = ${x.t2}, T3 = ${x.t3}, T4 = ${x.t4} (ms). Qual o atraso de ida e volta δ?`,
        answer: x.delay,
        unit: "ms",
        explain: `δ = (T4 − T1) − (T3 − T2) = ${x.t4 - x.t1} − ${x.t3 - x.t2} = ${x.delay} ms: o tempo total no cliente menos o tempo que o servidor levou para responder.`,
      };
    },
  },
];

export const alohaCsma: Practice[] = [
  {
    title: "Vazão do ALOHA puro",
    make(seed) {
      const d = dice(seed);
      const g = d.pick([0.25, 0.5, 0.75, 1, 1.5, 2]);
      const s = pureAloha(g) * 100;
      return {
        prompt: `No ALOHA puro, a carga oferecida é G = ${num(g)} quadros por tempo de quadro. Que fração do tempo carrega quadros sem colisão, em %? (uma casa decimal)`,
        answer: s,
        tolerance: 0.1,
        unit: "%",
        explain: `S = G·e^(−2G) = ${num(g)} × e^(−${num(2 * g)}) ≈ ${num(s, 1)}%. O máximo, 18,4%, acontece em G = 0,5.`,
      };
    },
  },
  {
    title: "Recuo exponencial",
    make(seed) {
      const d = dice(seed);
      const k = d.int(1, 12);
      const top = 2 ** Math.min(k, 10) - 1;
      return {
        prompt: `Depois da ${k}ª colisão seguida, o adaptador Ethernet sorteia quantos intervalos esperar. Qual o maior número possível?`,
        answer: top,
        explain: `Sorteia-se de 0 a 2^min(k, 10) − 1 = ${top}. A faixa dobra a cada colisão e para de crescer na décima; na 16ª o quadro é descartado.`,
      };
    },
  },
];

export const diffieHellman: Practice[] = [
  {
    title: "Metade pública",
    make(seed) {
      const d = dice(seed);
      const a = d.int(2, 20);
      const A = share(a);
      return {
        prompt: `Com p = 23 e g = 5, a Lia sorteia o segredo a = ${a}. Que número ela manda em público?`,
        answer: A,
        explain: `A = g^a mod p = 5^${a} mod 23 = ${A}. Dá para ir multiplicando por 5 e tirando o resto de 23 a cada passo.`,
      };
    },
  },
  {
    title: "Segredo combinado",
    make(seed) {
      const d = dice(seed);
      const [a, b] = d.distinct(2, 2, 20) as [number, number];
      const B = share(b);
      const k = shared(B, a);
      return {
        prompt: `Com p = 23 e g = 5, o segredo da Lia é a = ${a} e a Ana mandou B = ${B}. Qual o segredo combinado?`,
        answer: k,
        explain: `K = B^a mod p = ${B}^${a} mod 23 = ${k}. A Ana chega ao mesmo número com A^b, sem que nenhum dos segredos tenha passado pela rede.`,
      };
    },
  },
];

const PRIMES = [5, 7, 11, 13, 17, 19, 23];
export const rsa: Practice[] = [
  {
    title: "Cifrar com a pública",
    make(seed) {
      const d = dice(seed);
      for (;;) {
        const [p, q] = d.distinct(2, 0, PRIMES.length - 1).map((i) => PRIMES[i] as number) as [
          number,
          number,
        ];
        const phi = (p - 1) * (q - 1);
        if (gcd(3, phi) !== 1) continue;
        const k = keys(p, q);
        const m = d.int(2, Math.min(k.n - 1, 20));
        const c = modpow(m, 3, k.n);
        return {
          prompt: `A chave pública é n = ${k.n} e e = 3. Quanto vale a mensagem m = ${m} cifrada?`,
          answer: c,
          explain: `c = m^e mod n = ${m}³ mod ${k.n} = ${m ** 3} mod ${k.n} = ${c}. Só quem conhece os fatores de ${k.n} (${p} × ${q}) consegue calcular d e desfazer.`,
        };
      }
    },
  },
  {
    title: "φ(n)",
    make(seed) {
      const d = dice(seed);
      const [p, q] = d.distinct(2, 0, PRIMES.length - 1).map((i) => PRIMES[i] as number) as [number, number];
      return {
        prompt: `n = ${p * q} = ${p} × ${q}. Quanto vale φ(n), o número usado para achar a chave privada?`,
        answer: (p - 1) * (q - 1),
        explain: `φ(n) = (p − 1)(q − 1) = ${p - 1} × ${q - 1} = ${(p - 1) * (q - 1)}. Sem conhecer p e q, calcular φ(n) é tão difícil quanto fatorar n.`,
      };
    },
  },
];

export const dnsPoisoning: Practice[] = [
  {
    title: "Corridas esperadas",
    make(seed) {
      const d = dice(seed);
      const g = d.pick([16, 32, 64, 128, 256, 512]);
      const races = TXID_SPACE / g;
      return {
        prompt: `Com identificador de 16 bits e porta fixa, o atacante manda ${g} respostas falsas por corrida. Quantas corridas são esperadas até o primeiro acerto?`,
        answer: races,
        explain: `Cada corrida acerta com chance ${g}/65.536 = ${num(raceChance(g, false) * 100, 3)}%. A média de tentativas é o inverso: 65.536 / ${g} = ${big(races)}.`,
      };
    },
  },
];

export const amplificacao: Practice[] = [
  {
    title: "Tráfego refletido",
    make(seed) {
      const d = dice(seed);
      const req = d.pick([40, 50, 64, 80]);
      const factor = d.pick([10, 20, 30, 50]);
      const mbps = d.pick([5, 10, 20, 50]);
      return {
        prompt: `Cada pedido de ${req} bytes, com origem forjada, faz o refletor mandar ${req * factor} bytes à vítima. Se o atacante envia ${mbps} Mbit/s de pedidos, quanto chega à vítima, em Mbit/s?`,
        answer: mbps * factor,
        unit: "Mbit/s",
        explain: `O fator de amplificação é ${req * factor} / ${req} = ${factor}. A vítima recebe ${mbps} × ${factor} = ${mbps * factor} Mbit/s, sem que nenhum pacote saia do endereço real do atacante.`,
      };
    },
  },
];

export const janelaDeslizante: Practice[] = [
  {
    title: "Maior janela",
    make(seed) {
      const d = dice(seed);
      const k = d.int(2, 8);
      const sr = d.pick([true, false]);
      const ans = sr ? 2 ** (k - 1) : 2 ** k - 1;
      return {
        prompt: `Os números de sequência têm ${k} bits. Qual a maior janela segura em ${sr ? "repetição seletiva" : "Go-Back-N"}?`,
        answer: ans,
        explain: sr
          ? `Na repetição seletiva a janela do receptor também anda; para nunca confundir um quadro novo com uma retransmissão, ela vai até metade do espaço: 2^${k - 1} = ${ans}.`
          : `No Go-Back-N o receptor aceita só o próximo quadro; a janela pode ter 2^${k} − 1 = ${ans}. Com 2^${k}, uma janela inteira perdida seria confundida com a seguinte.`,
      };
    },
  },
];

export const tcpConexao: Practice[] = [
  {
    title: "Próximo número de sequência",
    make(seed) {
      const d = dice(seed);
      const isn = d.int(1000, 9000);
      const n = d.int(2, 5);
      const mss = d.pick([100, 500, 1000, 1460]);
      const next = isn + 1 + n * mss;
      return {
        prompt: `O cliente abriu a conexão com número inicial ${isn} e já mandou ${n} segmentos de ${mss} bytes. Qual o número de sequência do próximo segmento?`,
        answer: next,
        explain: `O SYN consome um número: os dados começam em ${isn + 1}. Depois de ${n} × ${mss} = ${n * mss} bytes, o próximo começa em ${isn + 1} + ${n * mss} = ${next}. É também o ACK que o servidor manda.`,
      };
    },
  },
];

export const congestionamento: Practice[] = [
  {
    title: "Partida lenta",
    make(seed) {
      const d = dice(seed);
      const e = d.int(3, 7);
      const ss = 2 ** e;
      return {
        prompt: `A janela começa em 1 segmento e o limiar (ssthresh) é ${ss}. Sem perdas, quantas idas e voltas até a janela chegar ao limiar?`,
        answer: e,
        explain: `Na partida lenta a janela dobra a cada ida e volta: 1, 2, 4… chega a ${ss} = 2^${e} depois de ${e}. A partir daí ela cresce 1 segmento por ida e volta.`,
      };
    },
  },
];

export const wireguard: Practice[] = [
  {
    title: "MTU dentro do túnel",
    make(seed) {
      const d = dice(seed);
      const outer = d.pick([1500, 1492, 1400]);
      const v6 = d.pick([true, false]);
      const over = v6 ? 80 : 60;
      return {
        prompt: `O caminho aceita pacotes de ${outer} bytes e o túnel WireGuard roda sobre ${v6 ? "IPv6" : "IPv4"}. Qual o maior pacote interno que passa sem fragmentar?`,
        answer: outer - over,
        unit: "bytes",
        explain: `Cada pacote ganha ${v6 ? "40 do IPv6" : "20 do IPv4"}, 8 do UDP e 32 do WireGuard (cabeçalho e marca de autenticação): ${over} bytes. ${outer} − ${over} = ${outer - over}.`,
      };
    },
  },
];

export const wifiCsmaCa: Practice[] = [
  {
    title: "Recuo congelado",
    make(seed) {
      const d = dice(seed);
      const [a, b] = d.distinct(2, 0, 15) as [number, number];
      const lead = Math.min(a, b);
      return {
        prompt: `Depois do DIFS, A sorteia ${a} slots de recuo e B sorteia ${b}. Quando o primeiro começa a transmitir, em quanto fica o contador do outro?`,
        answer: Math.max(a, b) - lead,
        unit: "slots",
        explain: `${a < b ? "A" : "B"} chega a zero depois de ${lead} slots; o outro contou os mesmos ${lead} e congela em ${Math.max(a, b)} − ${lead} = ${Math.max(a, b) - lead}.`,
      };
    },
  },
];

export const celular: Practice[] = [
  {
    title: "Reúso de frequências",
    make(seed) {
      const d = dice(seed);
      const n = d.pick([3, 4, 7, 12]);
      const per = d.pick([20, 30, 40, 50]);
      const channels = n * per;
      const cells = d.pick([21, 42, 84, 120]);
      return {
        prompt: `Uma operadora tem ${channels} canais e usa grupos de reúso de ${n} células. A cidade tem ${cells} células. Quantas conversas simultâneas a cidade suporta, com um canal por conversa?`,
        answer: per * cells,
        explain: `Cada célula recebe ${channels} ÷ ${n} = ${per} canais; ${per} × ${cells} células = ${big(per * cells)}.`,
      };
    },
  },
];

export const enquadramento: Practice[] = [
  {
    title: "Enchimento de bytes",
    make(seed) {
      const d = dice(seed);
      const data = Array.from({ length: 8 }, () => d.pick([0x41, 0x7e, 0x7d, 0x10, 0x55, 0x7e, 0x20]));
      const out = byteStuff(data);
      return {
        prompt: `Os dados de um quadro PPP são ${fhex(data)}. Quantos bytes ficam entre as duas flags?`,
        answer: out.length,
        unit: "bytes",
        explain: `Cada 7E vira 7D 5E e cada 7D vira 7D 5D: ${fhex(out)}, ${out.length} bytes.`,
      };
    },
  },
  {
    title: "Enchimento de bits",
    make(seed) {
      const d = dice(seed);
      const bits = Array.from({ length: 20 }, () => (d.int(0, 9) < 7 ? "1" : "0")).join("");
      const r = bitStuff(bits);
      return {
        prompt: `O HDLC vai enviar os bits ${bits}. Quantos zeros o transmissor insere?`,
        answer: r.inserted.length,
        unit: "zeros",
        explain: `Um 0 entra depois de cada sequência de cinco 1 seguidos: ${r.out}.`,
      };
    },
  },
];

export const comutacao: Practice[] = [
  {
    title: "Pacotes em linha de montagem",
    make(seed) {
      const d = dice(seed);
      const links = d.int(2, 5);
      const n = d.int(2, 10);
      const per = d.pick([2, 4, 5, 10]);
      const total = (n + links - 1) * per;
      return {
        prompt: `Um arquivo vira ${n} pacotes; cada pacote leva ${per} ms para ser transmitido em cada um dos ${links} enlaces (armazena e encaminha, sem propagação). Em quantos ms chega o último bit?`,
        answer: total,
        unit: "ms",
        explain: `O último pacote termina o primeiro enlace após ${n} × ${per} ms e atravessa mais ${links - 1}: (${n} + ${links} − 1) × ${per} = ${total} ms.`,
      };
    },
  },
];

export const fragmentacao: Practice[] = [
  {
    title: "Deslocamento do fragmento",
    make(seed) {
      const d = dice(seed);
      const mtu = d.pick([576, 1006, 1280, 1500]);
      const total = d.int(3, 8) * 1000;
      const fr = fragment(total, 20, mtu);
      const k = d.int(1, fr.length - 1);
      const f = fr[k] as { offset: number };
      const chunk = Math.floor((mtu - 20) / 8) * 8;
      return {
        prompt: `Um datagrama IPv4 de ${total} bytes (cabeçalho de 20) passa por um enlace de MTU ${mtu}. Qual é o deslocamento, em blocos de 8 bytes, do fragmento ${k + 1}?`,
        answer: f.offset,
        explain: `Cada fragmento leva até ${chunk} bytes de dados (${mtu} − 20, arredondado para baixo a múltiplo de 8). O fragmento ${k + 1} começa no byte ${k * chunk}: ${k * chunk} / 8 = ${f.offset}.`,
      };
    },
  },
];

export const p2p: Practice[] = [
  {
    title: "Distância XOR",
    make(seed) {
      const d = dice(seed);
      const [a, k] = d.distinct(2, 0, 15) as [number, number];
      const b4 = (x: number) => x.toString(2).padStart(4, "0");
      return {
        prompt: `No Kademlia com identificadores de 4 bits, qual é a distância entre o nó ${b4(a)} e a chave ${b4(k)}?`,
        answer: a ^ k,
        explain: `${b4(a)} XOR ${b4(k)} = ${b4(a ^ k)}, que lido como número vale ${a ^ k}.`,
      };
    },
  },
  {
    title: "Distribuição par a par",
    make(seed) {
      const d = dice(seed);
      const n = d.pick([10, 20, 40, 50, 100]);
      const up = d.pick([2, 4, 5, 10]);
      const server = d.pick([50, 100, 200]);
      const t = peerToPeer({ file: 1000, server, up, down: 1000 }, n);
      return {
        prompt: `Um arquivo de 1000 Mbit vai para ${n} pares. O servidor envia a ${server} Mbit/s e cada par repassa a ${up} Mbit/s; o download não limita. Quantos segundos leva, pelo modelo de fluxo contínuo?`,
        answer: Number(t.toFixed(1)),
        tolerance: 0.5,
        unit: "s",
        explain: `O limite é a capacidade de envio somada: ${n} × 1000 / (${server} + ${n} × ${up}) = ${num(t, 1)} s, maior que 1000 / ${server} = ${num(1000 / server, 1)} s do servidor mandar uma cópia.`,
      };
    },
  },
];

export const redEcn: Practice[] = [
  {
    title: "Chance de marcar no RED",
    make(seed) {
      const d = dice(seed);
      const minTh = d.pick([5, 10, 20]);
      const maxTh = minTh * d.pick([2, 3, 4]);
      const maxP = d.pick([0.1, 0.2, 0.4, 0.5]);
      const avg = d.int(minTh + 1, maxTh - 1);
      const p = prob(avg, { w: 0.25, minTh, maxTh, maxP }) * 100;
      return {
        prompt: `O RED tem limiares ${minTh} e ${maxTh} e chance máxima de ${num(maxP * 100)}%. Com a fila média em ${avg}, qual é a chance, em %, de marcar o próximo pacote?`,
        answer: Number(p.toFixed(1)),
        tolerance: 0.1,
        unit: "%",
        explain: `${num(maxP * 100)}% × (${avg} − ${minTh}) / (${maxTh} − ${minTh}) = ${num(p, 1)}%.`,
      };
    },
  },
  {
    title: "Nova média da fila",
    make(seed) {
      const d = dice(seed);
      const w = d.pick([0.1, 0.2, 0.25, 0.5]);
      const avg = d.int(0, 20);
      const q = d.int(0, 30);
      const next = (1 - w) * avg + w * q;
      return {
        prompt: `A média da fila no RED vale ${avg}, o peso é ${num(w)} e chega um pacote com ${q} na fila. Qual é a nova média?`,
        answer: Number(next.toFixed(2)),
        tolerance: 0.01,
        explain: `${num(1 - w)} × ${avg} + ${num(w)} × ${q} = ${num(next)}.`,
      };
    },
  },
];

export const ipsec: Practice[] = [
  {
    title: "Tamanho com ESP em túnel",
    make(seed) {
      const d = dice(seed);
      const n = d.int(100, 1400);
      const e = espSize(n, "tunnel");
      return {
        prompt: `Um pacote IP de ${n} bytes entra num túnel ESP com AES-GCM (vetor de 8 bytes, etiqueta de 16). A parte cifrada, carga mais 2 bytes de fim, precisa terminar num múltiplo de 4. Quantos bytes tem o pacote que sai?`,
        answer: e.total,
        unit: "bytes",
        explain: `Enchimento: ${n} + 2 = ${n + 2}, faltam ${e.pad} para múltiplo de 4. Total: 20 (IP novo) + 8 (ESP) + 8 (vetor) + ${n} + ${e.pad} + 2 + 16 = ${e.total}.`,
      };
    },
  },
];

export const macSemColisao: Practice[] = [
  {
    title: "Eficiência do mapa de bits",
    make(seed) {
      const d = dice(seed);
      const n = d.pick([16, 32, 64, 128]);
      const f = d.pick([50, 100, 200, 500]);
      const k = d.int(1, 8);
      const e = bitmapEfficiency(f, n, k) * 100;
      return {
        prompt: `Uma rede com mapa de bits tem ${n} estações e quadros de ${f} bits. Numa rodada, ${k} ${k === 1 ? "estação transmite" : "estações transmitem"}. Que fração do tempo, em %, leva dados?`,
        answer: Number(e.toFixed(1)),
        tolerance: 0.1,
        unit: "%",
        explain: `A rodada tem ${n} bits de disputa e ${k} × ${f} = ${k * f} de dados: ${k * f} / (${k * f} + ${n}) = ${num(e, 1)}%.`,
      };
    },
  },
  {
    title: "Eficiência da contagem binária",
    make(seed) {
      const d = dice(seed);
      const bits = d.int(3, 12);
      const n = 2 ** bits;
      const f = d.pick([50, 100, 200, 500]);
      const e = countdownEfficiency(f, n) * 100;
      return {
        prompt: `Com contagem binária entre ${big(n)} estações e quadros de ${f} bits, que fração do tempo, em %, leva dados?`,
        answer: Number(e.toFixed(1)),
        tolerance: 0.1,
        unit: "%",
        explain: `O endereço tem log2(${big(n)}) = ${bits} bits, e cada quadro paga essa disputa: ${f} / (${f} + ${bits}) = ${num(e, 1)}%.`,
      };
    },
  },
];

export const rtp: Practice[] = [
  {
    title: "Passo do timestamp",
    make(seed) {
      const d = dice(seed);
      const hz = d.pick([8000, 16000, 48000, 90000]);
      const ms = d.pick([10, 20, 30, 40]);
      const step = (hz * ms) / 1000;
      return {
        prompt: `Um fluxo RTP usa relógio de ${big(hz)} Hz e manda um pacote a cada ${ms} ms. Quanto o timestamp sobe de um pacote para o seguinte?`,
        answer: step,
        explain: `${big(hz)} unidades por segundo × ${ms} / 1000 s = ${big(step)}.`,
      };
    },
  },
  {
    title: "Atualizar o jitter",
    make(seed) {
      const d = dice(seed);
      const j = d.int(0, 20);
      const dd = d.int(0, 40);
      const next = j + (dd - j) / 16;
      return {
        prompt: `O jitter estimado vale ${j} ms e chega um pacote cuja variação de trânsito, em módulo, é ${dd} ms. Qual é o novo jitter, pela fórmula do RTP?`,
        answer: Number(next.toFixed(2)),
        tolerance: 0.01,
        unit: "ms",
        explain: `J + (|D| − J) / 16 = ${j} + (${dd} − ${j}) / 16 = ${num(next)} ms.`,
      };
    },
  },
];

export const tor: Practice[] = [
  {
    title: "Montar um circuito",
    make(seed) {
      const d = dice(seed);
      const ms = [d.int(1, 8) * 5, d.int(1, 8) * 5, d.int(1, 8) * 5];
      const bt = buildTime(ms.map((x, i) => ({ name: String(i), ms: x })));
      const total = (bt[2] as { total: number }).total;
      return {
        prompt: `Um circuito Tor tem trechos de ida de ${ms.join(", ")} ms: cliente à guarda, guarda ao meio, meio à saída. Cada extensão é uma ida e volta do cliente ao relé mais novo. Quanto leva montar o circuito?`,
        answer: total,
        unit: "ms",
        explain: `Idas e voltas: ${bt.map((x) => x.rtt).join(" + ")} = ${total} ms.`,
      };
    },
  },
];
