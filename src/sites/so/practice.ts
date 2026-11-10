import type { Practice } from "../../contracts/types.ts";
import { modeString } from "../../sim/os/access.ts";
import { roundUp } from "../../sim/os/buddy.ts";
import { deltaList } from "../../sim/os/clock.ts";
import { diskSchedule } from "../../sim/os/disk.ts";
import { DIRECT, mapFile, perBlock } from "../../sim/os/inode.ts";
import { copies, pipeRun } from "../../sim/os/ipc.ts";
import { capacity } from "../../sim/os/raid.ts";
import { replace } from "../../sim/os/replace.ts";
import { remoteCost } from "../../sim/os/rpc.ts";
import { type Proc, schedule } from "../../sim/os/sched.ts";
import { PAGE, perSlab } from "../../sim/os/slab.ts";
import { serve } from "../../sim/os/threads.ts";
import { big, dice, hex, num } from "../shared/practice-kit.ts";

export const paginacaoTlb: Practice[] = [
  {
    title: "Endereço físico",
    make(seed) {
      const d = dice(seed);
      const vpn = d.int(1, 15);
      const frame = d.int(1, 15);
      const off = d.int(0, 4095);
      const va = vpn * 4096 + off;
      const pa = frame * 4096 + off;
      return {
        prompt: `Páginas de 4 KiB. A página virtual ${vpn} está no quadro ${frame}. Em que endereço físico cai o endereço virtual ${hex(va, 4)}? Pode responder em hexadecimal.`,
        answer: pa,
        shown: hex(pa, 4),
        explain: `Os 12 bits de baixo (${hex(off, 3)}) são o deslocamento e passam iguais. Os de cima trocam a página ${vpn} pelo quadro ${frame}: ${frame} × 4096 + ${hex(off, 3)} = ${hex(pa, 4)}.`,
      };
    },
  },
  {
    title: "Tempo efetivo com TLB",
    make(seed) {
      const d = dice(seed);
      const tlb = d.pick([1, 2, 5]);
      const mem = d.pick([50, 80, 100]);
      const h = d.pick([80, 90, 95, 98, 99]);
      const eat = (h / 100) * (tlb + mem) + (1 - h / 100) * (tlb + 2 * mem);
      return {
        prompt: `A TLB responde em ${tlb} ns, a memória em ${mem} ns e a TLB acerta ${h}% das vezes. Qual o tempo efetivo de cada acesso, em ns? (uma casa decimal)`,
        answer: eat,
        tolerance: 0.1,
        unit: "ns",
        explain: `Acerto: ${tlb} + ${mem} = ${tlb + mem} ns. Falha: lê a PTE e depois o dado, ${tlb} + 2 × ${mem} = ${tlb + 2 * mem} ns. Média: ${h}% × ${tlb + mem} + ${100 - h}% × ${tlb + 2 * mem} = ${num(eat, 1)} ns.`,
      };
    },
  },
];

export const paginacaoMultinivel: Practice[] = [
  {
    title: "Tabela de um nível",
    make(seed) {
      const d = dice(seed);
      const pageBits = d.pick([12, 13, 14, 16]);
      const pte = d.pick([4, 8]);
      const entries = 2 ** (32 - pageBits);
      const kib = (entries * pte) / 1024;
      return {
        prompt: `Endereços de 32 bits, páginas de ${big(2 ** pageBits)} bytes e PTE de ${pte} bytes. Quantos KiB ocupa uma tabela de páginas de um nível só, por processo?`,
        answer: kib,
        unit: "KiB",
        explain: `Sobram ${32 - pageBits} bits para o número da página: 2^${32 - pageBits} = ${big(entries)} entradas de ${pte} bytes, ${big(kib)} KiB, mesmo que o processo use pouca memória. É isso que a tabela em vários níveis evita.`,
      };
    },
  },
];

const PIDS = ["A", "B", "C", "D"];
function procs(d: ReturnType<typeof dice>, n: number, arrivals: boolean): Proc[] {
  return PIDS.slice(0, n).map((pid, i) => ({
    pid,
    arrival: arrivals ? (i === 0 ? 0 : d.int(0, 6)) : 0,
    burst: d.int(1, 8),
    priority: 0,
  }));
}
const list = (ps: Proc[], arr: boolean) =>
  ps
    .map((p) => (arr ? `${p.pid} (chega em ${p.arrival}, ${p.burst} de CPU)` : `${p.pid} = ${p.burst}`))
    .join(", ");

export const escalonamento: Practice[] = [
  {
    title: "Espera média no FCFS",
    make(seed) {
      const d = dice(seed);
      const ps = procs(d, 3, false);
      const r = schedule(ps, { algo: "fcfs" });
      return {
        prompt: `Três processos chegam juntos, nesta ordem, com estas durações: ${list(ps, false)}. Qual a espera média no FCFS? (uma casa decimal)`,
        answer: r.avgWait,
        tolerance: 0.05,
        explain: `Cada um espera a soma dos anteriores: ${ps.map((p) => `${p.pid} ${r.stats[p.pid]?.wait}`).join(", ")}. Média: ${num(r.avgWait, 1)}.`,
      };
    },
  },
  {
    title: "Espera média no SJF",
    make(seed) {
      const d = dice(seed);
      const ps = procs(d, 4, false);
      const r = schedule(ps, { algo: "sjf" });
      return {
        prompt: `Quatro processos chegam juntos: ${list(ps, false)}. Qual a espera média no SJF, que roda primeiro o mais curto? (uma casa decimal)`,
        answer: r.avgWait,
        tolerance: 0.05,
        explain: `Em ordem de duração, cada um espera a soma dos mais curtos: ${ps.map((p) => `${p.pid} ${r.stats[p.pid]?.wait}`).join(", ")}. Média: ${num(r.avgWait, 1)}. Nenhuma outra ordem dá média menor.`,
      };
    },
  },
];

export const roundRobin: Practice[] = [
  {
    title: "Retorno no Round Robin",
    make(seed) {
      const d = dice(seed);
      const q = d.int(2, 4);
      const ps = procs(d, 3, false);
      const r = schedule(ps, { algo: "rr", quantum: q });
      const who = d.pick(ps);
      return {
        prompt: `Round Robin com quantum ${q}, sem custo de troca. Chegam juntos, nesta ordem: ${list(ps, false)}. Em que instante ${who.pid} termina?`,
        answer: r.stats[who.pid]?.finish ?? 0,
        explain: `Seguindo o rodízio: ${r.slices
          .filter((s) => s.kind === "run")
          .map((s) => `${s.pid} ${s.from}–${s.to}`)
          .join(", ")}. ${who.pid} termina em ${r.stats[who.pid]?.finish}.`,
      };
    },
  },
];

export const substituicaoPaginas: Practice[] = [
  {
    title: "Faltas de página",
    make(seed) {
      const d = dice(seed);
      const refs = Array.from({ length: 10 }, () => d.int(0, 5));
      const algo = d.pick(["fifo", "lru"] as const);
      const r = replace(refs, 3, algo);
      return {
        prompt: `Três quadros, começando vazios, e a sequência de páginas ${refs.join(" ")}. Quantas faltas de página o ${algo.toUpperCase()} provoca?`,
        answer: r.faults,
        explain: `Marcando acerto (A) ou falta (F) em cada acesso: ${r.steps.map((s) => (s.hit ? "A" : "F")).join(" ")}. São ${r.faults} faltas e ${r.hits} acertos. ${algo === "lru" ? "O LRU tira a página usada há mais tempo." : "O FIFO tira a que está há mais tempo na memória, mesmo que seja muito usada."}`,
      };
    },
  },
];

export const escalonamentoDisco: Practice[] = [
  {
    title: "Movimento do braço",
    make(seed) {
      const d = dice(seed);
      const head = d.int(20, 180);
      const reqs = d.distinct(5, 0, 199);
      const algo = d.pick(["fcfs", "sstf"] as const);
      const r = diskSchedule(head, reqs, algo, { max: 199, up: true });
      return {
        prompt: `O braço está no cilindro ${head} e a fila é ${reqs.join(", ")}. Quantos cilindros ele percorre no ${algo.toUpperCase()}?`,
        answer: r.total,
        unit: "cilindros",
        explain: `Ordem de atendimento: ${r.order.join(", ")}. Somando as distâncias entre posições seguidas: ${r.total} cilindros. ${algo === "sstf" ? "O SSTF vai sempre ao pedido mais próximo." : "O FCFS atende na ordem de chegada, indo e voltando."}`,
      };
    },
  },
];

export const buddy: Practice[] = [
  {
    title: "Bloco e sobra",
    make(seed) {
      const d = dice(seed);
      const req = d.int(5, 500);
      const b = roundUp(req, 4);
      return {
        prompt: `Um pedido de ${req} KiB chega ao alocador buddy (blocos de 4 KiB para cima). Quantos KiB ficam alocados e sem uso dentro do bloco?`,
        answer: b - req,
        unit: "KiB",
        explain: `O bloco é a menor potência de dois que cabe o pedido: ${b} KiB. A sobra, ${b} − ${req} = ${b - req} KiB, é fragmentação interna.`,
      };
    },
  },
  {
    title: "Endereço do irmão",
    make(seed) {
      const d = dice(seed);
      const size = 2 ** d.int(2, 7);
      const at = size * d.int(0, 15);
      return {
        prompt: `Um bloco livre de ${size} KiB começa em ${at} KiB. Em que endereço, em KiB, começa o irmão dele?`,
        answer: at ^ size,
        unit: "KiB",
        explain: `O irmão sai de endereço XOR tamanho: ${at} XOR ${size} = ${at ^ size}. Se ele também estiver livre, os dois viram um bloco de ${size * 2} KiB em ${Math.min(at, at ^ size)}.`,
      };
    },
  },
];

export const slab: Practice[] = [
  {
    title: "Objetos por página",
    make(seed) {
      const d = dice(seed);
      const size = d.pick([48, 64, 96, 192, 200, 256, 320, 500, 700]);
      const n = perSlab(size);
      return {
        prompt: `Um cache slab guarda objetos de ${size} bytes em páginas de ${big(PAGE)} bytes. Quantos objetos cabem numa página?`,
        answer: n,
        explain: `${big(PAGE)} / ${size} = ${num(PAGE / size)}; só objetos inteiros contam: ${n}. Sobram ${PAGE - n * size} bytes na página.`,
      };
    },
  },
];

export const raid: Practice[] = [
  {
    title: "Capacidade útil",
    make(seed) {
      const d = dice(seed);
      const level = d.pick(["0", "10", "5"] as const);
      const disks = level === "10" ? d.pick([4, 6, 8]) : d.int(3, 8);
      const tb = d.pick([1, 2, 4]);
      const cap = capacity(level, disks) * tb;
      return {
        prompt: `RAID ${level} com ${disks} discos de ${tb} TB. Quantos TB sobram para dados?`,
        answer: cap,
        unit: "TB",
        explain:
          level === "0"
            ? `RAID 0 só divide em faixas: todos os ${disks} × ${tb} = ${cap} TB, e nenhuma falha é tolerada.`
            : level === "10"
              ? `RAID 10 espelha em pares: metade guarda cópias, ${disks} / 2 × ${tb} = ${cap} TB.`
              : `RAID 5 gasta o equivalente a um disco com paridade: (${disks} − 1) × ${tb} = ${cap} TB.`,
      };
    },
  },
];

export const inodes: Practice[] = [
  {
    title: "Ponteiros diretos e indiretos",
    make(seed) {
      const d = dice(seed);
      const bs = d.pick([1024, 2048, 4096]);
      const kib = ((DIRECT + perBlock(bs)) * bs) / 1024;
      return {
        prompt: `Blocos de ${big(bs)} bytes, ponteiros de 4 bytes e ${DIRECT} ponteiros diretos no inode. Qual o maior arquivo, em KiB, que cabe usando só os diretos e o indireto simples?`,
        answer: kib,
        unit: "KiB",
        explain: `O bloco indireto guarda ${big(bs)} / 4 = ${perBlock(bs)} ponteiros. Total: (${DIRECT} + ${perBlock(bs)}) × ${big(bs)} bytes = ${big(kib)} KiB.`,
      };
    },
  },
  {
    title: "Blocos de dados",
    make(seed) {
      const d = dice(seed);
      const bs = 4096;
      const size = d.int(13, 1500) * 4096 - d.int(0, 4000);
      const m = mapFile(size, bs);
      return {
        prompt: `Um arquivo tem ${big(size)} bytes, em blocos de 4 KiB com ${DIRECT} ponteiros diretos. Quantos blocos de dados ele ocupa?`,
        answer: m.dataBlocks,
        explain: `${big(size)} / 4096 arredondado para cima dá ${m.dataBlocks} blocos: ${m.direct} pelos diretos e ${m.single} pelo indireto simples${m.double ? `, ${m.double} pelo duplo` : ""}.`,
      };
    },
  },
];

export const segmentacao: Practice[] = [
  {
    title: "Base mais deslocamento",
    make(seed) {
      const d = dice(seed);
      const base = d.int(1, 60) * 1024;
      const limit = d.int(2, 16) * 1024;
      const off = d.int(0, limit - 1);
      return {
        prompt: `O segmento de dados tem base ${big(base)} e limite ${big(limit)} bytes. O programa acessa o deslocamento ${big(off)}. Qual o endereço físico?`,
        answer: base + off,
        explain: `${big(off)} é menor que o limite, então o acesso passa. Endereço físico = base + deslocamento = ${big(base)} + ${big(off)} = ${big(base + off)}.`,
      };
    },
  },
];

export const controleDeAcesso: Practice[] = [
  {
    title: "Modo em octal",
    make(seed) {
      const d = dice(seed);
      const mode = d.pick([0o600, 0o640, 0o644, 0o664, 0o700, 0o750, 0o755, 0o711, 0o444, 0o604]);
      return {
        prompt: `Escreva o modo ${modeString(mode)} em octal, como o chmod recebe (três dígitos).`,
        answer: Number(mode.toString(8)),
        explain: `Cada trio vira um dígito: r = 4, w = 2, x = 1. ${modeString(mode).match(/.../g)?.join(" ")} dá ${mode.toString(8)}.`,
      };
    },
  },
];

export const threads: Practice[] = [
  {
    title: "Uma thread contra várias",
    make(seed) {
      const d = dice(seed);
      const n = d.int(2, 5);
      const cpu = d.int(1, 3);
      const io = d.int(3, 8);
      const one = serve(n, cpu, io, "single").end;
      const many = serve(n, cpu, io, "kernel").end;
      return {
        prompt: `O servidor atende ${n} pedidos; cada um usa ${cpu} ms de CPU e depois espera ${io} ms pelo disco. Com uma thread só, em que instante o último termina?`,
        answer: one,
        unit: "ms",
        explain: `Com uma thread, cada pedido espera o anterior inteiro: ${n} × (${cpu} + ${io}) = ${one} ms. Com uma thread do kernel por pedido, as esperas se sobrepõem e o último termina em ${many} ms.`,
      };
    },
  },
];

export const entradaSaida: Practice[] = [
  {
    title: "CPU gasta com interrupções",
    make(seed) {
      const d = dice(seed);
      const bytes = d.pick([512, 1024, 4096]);
      const cost = d.pick([2, 4, 5, 10]);
      return {
        prompt: `Um dispositivo entrega ${big(bytes)} bytes, um por interrupção, e cada interrupção custa ${cost} µs de CPU. Quanto tempo de CPU, em µs, o bloco inteiro consome?`,
        answer: bytes * cost,
        unit: "µs",
        explain: `${big(bytes)} interrupções × ${cost} µs = ${big(bytes * cost)} µs. Com DMA, a CPU programa a cópia uma vez e recebe uma interrupção só no fim.`,
      };
    },
  },
];

export const ipc: Practice[] = [
  {
    title: "Fim de arquivo no pipe",
    make(seed) {
      const d = dice(seed);
      const n = d.int(4, 12);
      const cap = d.int(2, 6);
      const r = d.int(2, 5);
      const ticks = pipeRun(n, cap, r);
      const end = ticks[ticks.length - 1]?.t ?? 0;
      return {
        prompt: `O escritor manda ${n} blocos, um por tick, num pipe de ${cap} blocos. O leitor tenta ler um bloco a cada ${r} ticks (nos ticks ${r}, ${2 * r}, ${3 * r}…). Em que tick o read() devolve 0, o fim de arquivo?`,
        answer: end,
        explain: `O leitor é o mais lento: tira os blocos nos ticks ${r}, ${2 * r}… até o ${n}º, no tick ${n * r}. Na tentativa seguinte, ${end}, o buffer está vazio e o escritor já fechou: fim de arquivo.`,
      };
    },
  },
  {
    title: "Cópias no pipe",
    make(seed) {
      const d = dice(seed);
      const mib = d.pick([1, 2, 5, 10, 64]);
      return {
        prompt: `Um processo passa ${mib} MiB a outro por um pipe. Quantos MiB são copiados entre memória de usuário e kernel no total?`,
        answer: copies("pipe", mib),
        unit: "MiB",
        explain: `Cada byte é copiado duas vezes: do escritor para o buffer no write() e do buffer para o leitor no read(). ${mib} × 2 = ${copies("pipe", mib)} MiB. Com memória compartilhada, seriam 0.`,
      };
    },
  },
];

export const tempoReal: Practice[] = [
  {
    title: "Utilização de tarefas periódicas",
    make(seed) {
      const d = dice(seed);
      const p1 = d.pick([4, 5, 8, 10]);
      const c1 = d.int(1, Math.max(1, Math.floor(p1 / 2)));
      const p2 = d.pick([6, 7, 9, 12, 15]);
      const c2 = d.int(1, Math.max(1, Math.floor(p2 / 2)));
      const u = (c1 / p1 + c2 / p2) * 100;
      return {
        prompt: `T1 precisa de ${c1} ${c1 === 1 ? "tick" : "ticks"} a cada ${p1} e T2 de ${c2} a cada ${p2}. Qual a utilização da CPU, em %? (uma casa decimal)`,
        answer: u,
        tolerance: 0.1,
        unit: "%",
        explain: `${c1} ÷ ${p1} + ${c2} ÷ ${p2} = ${num(u / 100, 3)}, ou ${num(u, 1)}%. ${u <= 82.8 ? "Abaixo do limite de 82,8% para duas tarefas: a taxa monotônica garante os prazos." : u <= 100 ? "Acima de 82,8%: a EDF garante, a taxa monotônica talvez não." : "Acima de 100%: nenhuma política cumpre todos os prazos."}`,
      };
    },
  },
];

export const ssd: Practice[] = [
  {
    title: "Amplificação de escrita",
    make(seed) {
      const d = dice(seed);
      const pages = d.pick([64, 128, 256]);
      const valid = d.int(1, pages - 1);
      const host = pages - valid;
      const wa = pages / host;
      return {
        prompt: `A coleta de lixo escolhe um bloco de ${pages} páginas com ${valid} ainda válidas, copia as válidas e o apaga. As ${host} páginas liberadas recebem escritas novas do sistema. Qual o fator de amplificação dessas escritas? (duas casas)`,
        answer: wa,
        tolerance: 0.01,
        explain: `A flash grava as ${valid} cópias mais as ${host} escritas pedidas: ${pages} ÷ ${host} = ${num(wa)}. Quanto mais páginas válidas na vítima, pior.`,
      };
    },
  },
];

export const alocacaoArquivos: Practice[] = [
  {
    title: "Leituras na lista encadeada",
    make(seed) {
      const d = dice(seed);
      const block = d.pick([1, 2, 4]);
      const offset = d.int(10, 400);
      const k = Math.floor(offset / block);
      return {
        prompt: `Um arquivo usa alocação encadeada com blocos de ${block} KiB, e o diretório guarda o primeiro bloco. Quantas leituras de disco são precisas para ler o byte que está a ${offset} KiB do início?`,
        answer: k + 1,
        explain: `O byte está no bloco ${offset} ÷ ${block} = ${k} (contando do 0). Para chegar nele, é preciso ler os blocos 0 a ${k}: ${k + 1} leituras. Com alocação indexada, seriam 2.`,
      };
    },
  },
];

export const mmap: Practice[] = [
  {
    title: "Faltas de página",
    make(seed) {
      const d = dice(seed);
      const page = d.pick([4, 16]);
      const fileKiB = page * d.int(8, 64);
      const readKiB = page * d.int(2, fileKiB / page - 1);
      const faults = readKiB / page;
      return {
        prompt: `Um arquivo de ${fileKiB} KiB é mapeado com mmap e o processo lê os primeiros ${readKiB} KiB, com páginas de ${page} KiB. Sem leitura antecipada, quantas faltas de página maiores acontecem?`,
        answer: faults,
        explain: `Uma falta por página tocada pela primeira vez: ${readKiB} ÷ ${page} = ${faults}. O resto do arquivo não é lido.`,
      };
    },
  },
];

export const alocacaoParticoes: Practice[] = [
  {
    title: "Melhor e pior que serve",
    make(seed) {
      const d = dice(seed);
      const holes = d.distinct(4, 2, 20);
      const ask = d.int(2, Math.max(...holes));
      const fits = holes.filter((h) => h >= ask);
      const worst = d.int(0, 1) === 1;
      const pick = worst ? Math.max(...fits) : Math.min(...fits);
      const rule = worst ? "pior que serve" : "melhor que serve";
      return {
        prompt: `A lista de buracos, em blocos, é ${holes.join(", ")}. Pelo ${rule}, em qual buraco entra um pedido de ${ask} blocos? Responda o tamanho do buraco.`,
        answer: pick,
        unit: "blocos",
        explain: `Servem os buracos com pelo menos ${ask} blocos: ${fits.join(", ")}. O ${rule} pega o ${worst ? "maior" : "menor"} deles, ${pick}, e sobram ${pick - ask} blocos.`,
      };
    },
  },
];

export const relogios: Practice[] = [
  {
    title: "Atraso de um alarme",
    make(seed) {
      const d = dice(seed);
      const hz = d.pick([100, 250, 1000]);
      const ms = d.int(3, 97);
      const tick = 1000 / hz;
      const a = deltaList([{ who: "p", ms }], tick)[0] as { ticks: number; lateMs: number };
      return {
        prompt: `Com ${hz} tiques por segundo, um processo pede um alarme para daqui a ${ms} ms. O alarme dispara no primeiro tique igual ou depois desse tempo. Com quantos ms de atraso ele dispara?`,
        answer: Number(a.lateMs.toFixed(2)),
        tolerance: 0.01,
        unit: "ms",
        explain: `Um tique dura ${num(tick)} ms; ${ms} ms viram ${a.ticks} tiques, arredondando para cima, ou ${num(a.ticks * tick)} ms. O atraso é ${num(a.ticks * tick)} − ${ms} = ${num(a.lateMs)} ms.`,
      };
    },
  },
];

export const barreiras: Practice[] = [
  {
    title: "Fases com barreira",
    make(seed) {
      const d = dice(seed);
      const threads = d.int(2, 4);
      const work = Array.from({ length: threads }, () => [d.int(1, 9), d.int(1, 9)]);
      const peaks = [0, 1].map((k) => Math.max(...work.map((r) => r[k] as number)));
      const total = (peaks[0] as number) + (peaks[1] as number);
      return {
        prompt: `${threads} threads fazem duas fases, com uma barreira entre elas. Na fase 1 levam ${work.map((r) => r[0]).join(", ")} tiques; na fase 2, ${work.map((r) => r[1]).join(", ")}. Quantos tiques até a última terminar a fase 2?`,
        answer: total,
        unit: "tiques",
        explain: `Ninguém começa a fase 2 antes da mais lenta da fase 1 (${peaks[0]} tiques). A fase 2 leva o tempo da mais lenta dela (${peaks[1]}): ${total} tiques.`,
      };
    },
  },
];

export const rpc: Practice[] = [
  {
    title: "Agrupar chamadas remotas",
    make(seed) {
      const d = dice(seed);
      const n = d.pick([10, 20, 50, 100]);
      const rtt = d.pick([50, 200, 400, 1000]);
      const k = { local: 0, marshal: 2, rtt, server: 3 };
      const each = n * remoteCost(k);
      const batch = 2 * k.marshal + rtt + n * k.server;
      return {
        prompt: `Cada chamada remota custa 2 × 2 µs de empacotamento, ${rtt} µs de ida e volta e 3 µs no servidor. Quantos µs se economizam trocando ${n} chamadas separadas por uma só que faz os ${n} trabalhos no servidor? Ignore o tamanho maior da mensagem.`,
        answer: each - batch,
        unit: "µs",
        explain: `Separadas: ${n} × ${remoteCost(k)} = ${big(each)} µs. Juntas: 4 + ${rtt} + ${n} × 3 = ${big(batch)} µs. A diferença, ${big(each - batch)} µs, são ${n - 1} idas e voltas e empacotamentos a menos.`,
      };
    },
  },
];
