import type { Practice } from "../../contracts/types.ts";
import { amdahl, ceiling } from "../../sim/arch/amdahl.ts";
import { loopOutcomes, predict } from "../../sim/arch/branch.ts";
import { toBytes } from "../../sim/arch/bytes.ts";
import { amat, splitAddress } from "../../sim/arch/cache.ts";
import { f32Bits, fields } from "../../sim/arch/float.ts";
import { encode, syndrome } from "../../sim/arch/hamming.ts";
import { addBits, bitsOf, signed, unsigned } from "../../sim/arch/ints.ts";
import { ripple } from "../../sim/arch/logic.ts";
import { encode as encodeInstr } from "../../sim/arch/riscv.ts";
import { vectorOps } from "../../sim/arch/simd.ts";
import { bufferStalls } from "../../sim/arch/writepolicy.ts";
import { big, bin, dice, hex, num } from "../shared/practice-kit.ts";

export const inteiros: Practice[] = [
  {
    title: "Mesmo padrão, sem sinal",
    make(seed) {
      const d = dice(seed);
      const v = -d.int(1, 128);
      const bits = bitsOf(v, 8);
      return {
        prompt: `Em 8 bits com complemento de dois, ${v} é guardado como um padrão de bits. Lido sem sinal, que número é esse padrão?`,
        answer: unsigned(bits),
        explain: `O padrão é ${bits.join("")}. Sem sinal, o bit 7 vale +128; com sinal, vale −128. A diferença é 256: ${v} + 256 = ${unsigned(bits)}.`,
      };
    },
  },
  {
    title: "Soma com overflow",
    make(seed) {
      const d = dice(seed);
      const a = d.int(40, 127);
      const b = d.int(128 - a, 127);
      const r = addBits(bitsOf(a, 8), bitsOf(b, 8));
      return {
        prompt: `Somando ${a} e ${b} em 8 bits com sinal, que valor o registrador mostra?`,
        answer: signed(r.sum),
        explain: `${a} + ${b} = ${a + b}, que passa de 127. O resultado guardado é ${r.sum.join("")}; com o bit 7 valendo −128, lê-se ${signed(r.sum)}. É overflow: o vai-um que entra no bit 7 difere do que sai.`,
      };
    },
  },
];

export const pontoFlutuante: Practice[] = [
  {
    title: "Expoente guardado",
    make(seed) {
      const d = dice(seed);
      const x = d.pick([0.375, 0.75, 1.5, 3, 6.5, 10, 12.25, 40, 100, 0.1, 1000, -2.5, -0.625]);
      const f = fields(f32Bits(x));
      return {
        prompt: `Num float de 32 bits, que número fica guardado no campo do expoente (8 bits, com viés 127) para ${num(x, 4)}?`,
        answer: f.stored,
        explain: `Normalize: ${num(Math.abs(x), 4)} = 1,… × 2^${f.exp}. O campo guarda o expoente mais o viés: ${f.exp} + 127 = ${f.stored} (${bin(f.stored, 8)}).`,
      };
    },
  },
];

export const hamming: Practice[] = [
  {
    title: "Síndrome",
    make(seed) {
      const d = dice(seed);
      const data = d.int(0, 15);
      const w = encode(data);
      const pos = d.int(0, 7);
      if (pos) w[pos] = (w[pos] ?? 0) ^ 1;
      const s = syndrome(w);
      const word = w.slice(1).join("");
      return {
        prompt: `Chegou a palavra Hamming(7,4) ${word} (posições 1 a 7, da esquerda para a direita; paridades em 1, 2 e 4). Qual a síndrome? Responda 0 se não houver erro.`,
        answer: s.pos,
        explain: `Refazendo as verificações: ${s.checks.map((c) => `p${c.p} ${c.ok ? "confere" : "falha"}`).join(", ")}. Somando as que falham: ${s.pos}${s.pos ? `, a posição do bit trocado` : ", nenhum erro"}.`,
      };
    },
  },
];

const CFG = { addrBits: 16, lines: 8, blockSize: 16, ways: 1, policy: "lru" as const };
export const cacheDireta: Practice[] = [
  {
    title: "Linha da cache",
    make(seed) {
      const d = dice(seed);
      const addr = d.int(0, 0xffff);
      const s = splitAddress(CFG, addr);
      return {
        prompt: `Cache de mapeamento direto com 8 linhas de 16 bytes e endereços de 16 bits. Em que linha (índice) cai o endereço ${hex(addr, 4)}?`,
        answer: s.index,
        explain: `Os 4 bits de baixo são o deslocamento (${s.offset}); os 3 seguintes, o índice. ${hex(addr, 4)} em binário termina em …${bin(addr & 0x7f, 7)}: índice ${bin(s.index, 3)} = ${s.index}. A tag é ${hex(s.tag)}.`,
      };
    },
  },
  {
    title: "Tempo médio de acesso",
    make(seed) {
      const d = dice(seed);
      const hit = d.pick([1, 2]);
      const miss = d.pick([2, 5, 10, 20]);
      const pen = d.pick([50, 100, 200]);
      const t = amat(hit, miss / 100, pen);
      return {
        prompt: `Acerto em ${hit} ns, taxa de faltas de ${miss}% e cada falta acrescenta ${pen} ns. Qual o tempo médio de acesso, em ns?`,
        answer: t,
        tolerance: 0.01,
        unit: "ns",
        explain: `AMAT = acerto + taxa de faltas × penalidade = ${hit} + ${num(miss / 100)} × ${pen} = ${num(t)} ns.`,
      };
    },
  },
];

export const instrucaoRiscv: Practice[] = [
  {
    title: "Montar uma instrução R",
    make(seed) {
      const d = dice(seed);
      const op = d.pick(["add", "sub", "and", "or", "xor"]);
      const [rd, rs1, rs2] = [d.int(1, 31), d.int(0, 31), d.int(0, 31)];
      const w = encodeInstr({ op, rd, rs1, rs2 });
      return {
        prompt: `Que palavra de 32 bits o montador gera para \`${op} x${rd}, x${rs1}, x${rs2}\`? Responda em hexadecimal (0x…).`,
        answer: w,
        shown: hex(w, 8),
        explain: `Formato R: funct7 | rs2 | rs1 | funct3 | rd | opcode = ${bin(w >>> 25, 7)} ${bin(rs2, 5)} ${bin(rs1, 5)} ${bin((w >>> 12) & 7, 3)} ${bin(rd, 5)} 0110011. Agrupando de 4 em 4 bits: ${hex(w, 8)}.`,
      };
    },
  },
];

export const ordemDosBytes: Practice[] = [
  {
    title: "Byte no endereço",
    make(seed) {
      const d = dice(seed);
      const value = d.int(0x10000000, 0x7fffffff);
      const endian = d.pick(["little", "big"] as const);
      const k = d.int(0, 3);
      const bytes = toBytes(value, 4, endian);
      return {
        prompt: `O valor ${hex(value, 8)} é gravado em ${endian === "little" ? "little-endian" : "big-endian"} a partir do endereço 100. Que byte fica no endereço ${100 + k}? Responda em hexadecimal.`,
        answer: bytes[k] ?? 0,
        shown: hex(bytes[k] ?? 0, 2),
        explain: `Em ${endian === "little" ? "little-endian o byte menos significativo vem primeiro" : "big-endian o mais significativo vem primeiro"}: 100 a 103 guardam ${bytes.map((b) => hex(b, 2)).join(" ")}. No ${100 + k} fica ${hex(bytes[k] ?? 0, 2)}.`,
      };
    },
  },
];

export const amdahlPractice: Practice[] = [
  {
    title: "Speedup",
    make(seed) {
      const d = dice(seed);
      const f = d.pick([50, 75, 80, 90, 95, 99]) / 100;
      const n = d.pick([2, 4, 8, 16, 64]);
      const s = amdahl(f, n);
      return {
        prompt: `${num(f * 100)}% do programa paraleliza perfeitamente e o resto é serial. Qual o speedup com ${n} núcleos? (duas casas decimais)`,
        answer: s,
        tolerance: 0.01,
        explain: `S = 1 / ((1 − f) + f/n) = 1 / (${num(1 - f)} + ${num(f, 2)}/${n}) ≈ ${num(s)}. Nem com infinitos núcleos passaria de 1/(1 − f) = ${num(ceiling(f))}.`,
      };
    },
  },
];

export const pipeline: Practice[] = [
  {
    title: "Ciclos no pipeline",
    make(seed) {
      const d = dice(seed);
      const n = d.int(4, 40);
      const k = d.pick([4, 5, 6]);
      const bubbles = d.int(0, 4);
      const c = k + n - 1 + bubbles;
      return {
        prompt: `Um pipeline de ${k} estágios executa ${n} instruções e perde ${bubbles} ciclos com bolhas. Quantos ciclos leva do primeiro IF ao último WB?`,
        answer: c,
        explain: `A primeira instrução leva ${k} ciclos; cada uma das outras ${n - 1} termina um ciclo depois da anterior; as bolhas somam ${bubbles}: ${k} + ${n - 1} + ${bubbles} = ${c}.`,
      };
    },
  },
];

export const previsaoDesvio: Practice[] = [
  {
    title: "Erros do preditor",
    make(seed) {
      const d = dice(seed);
      const iters = d.int(3, 8);
      const reps = d.int(2, 4);
      const kind = d.pick(["1bit", "2bit"] as const);
      const r = predict(loopOutcomes(iters, reps), kind);
      return {
        prompt: `Um laço de ${iters} voltas é executado ${reps} vezes seguidas. O desvio do fim é tomado em todas as voltas menos na saída. Quantos erros comete o preditor de ${kind === "1bit" ? '1 bit, começando em "não toma"' : "2 bits, começando em 01"}?`,
        answer: r.misses,
        explain: `Previsões, acerto (A) ou erro (E): ${r.guesses.map((g) => (g.hit ? "A" : "E")).join("")}. São ${r.misses} erros. ${kind === "1bit" ? "Com 1 bit, cada saída custa dois: a própria e a primeira volta seguinte." : "Com 2 bits, a saída só enfraquece o contador, e a volta seguinte acerta."}`,
      };
    },
  },
];

export const portasLogicas: Practice[] = [
  {
    title: "Somador de 4 bits",
    make(seed) {
      const d = dice(seed);
      const a = d.int(0, 15);
      const b = d.int(0, 15);
      const r = ripple(a, b, 4);
      const s = r.sum.reduce<number>((acc, bit, i) => acc + bit * 2 ** i, 0);
      return {
        prompt: `Um somador de 4 bits recebe ${bin(a, 4)} e ${bin(b, 4)}. Que valor sai nos 4 bits de soma (em decimal), sem contar o vai-um final?`,
        answer: s,
        explain: `${a} + ${b} = ${a + b}. Em 4 bits cabem de 0 a 15: a soma fica ${bin(s, 4)} = ${s}, e o vai-um final é ${r.carryOut}.`,
      };
    },
  },
];

export const simdGpu: Practice[] = [
  {
    title: "Instruções vetoriais",
    make(seed) {
      const d = dice(seed);
      const n = d.int(10, 200);
      const w = d.pick([4, 8, 16]);
      const v = vectorOps(n, w);
      return {
        prompt: `Um laço soma ${n} pares de números. Com instruções SIMD de ${w} pistas, quantas instruções vetoriais de soma são necessárias?`,
        answer: v,
        explain: `${n} / ${w} = ${num(n / w)}; a última pode ficar incompleta, então arredonda para cima: ${v}. ${n % w ? `Ela usa só ${n % w} das ${w} pistas.` : "Todas vão cheias."}`,
      };
    },
  },
];

export const politicasEscrita: Practice[] = [
  {
    title: "Buffer de escrita",
    make(seed) {
      const d = dice(seed);
      const writes = d.int(4, 12);
      const depth = d.int(1, 4);
      const drain = d.pick([5, 10]);
      const st = bufferStalls(writes, depth, drain);
      return {
        prompt: `A CPU faz ${writes} escritas seguidas, uma por ciclo. O buffer de escrita tem ${depth} ${depth === 1 ? "entrada" : "entradas"} e a memória aceita uma escrita a cada ${drain} ciclos. Quantos ciclos a CPU fica parada?`,
        answer: st,
        unit: "ciclos",
        explain: `As primeiras escritas entram no buffer sem parar a CPU. Quando ele enche, cada nova escrita espera a memória liberar uma entrada. Somando essas esperas: ${big(st)} ciclos.`,
      };
    },
  },
];

export const textoUnicode: Practice[] = [
  {
    title: "Bytes em UTF-8",
    make(seed) {
      const d = dice(seed);
      const cp = d.pick([0x41, 0xe9, 0xe7, 0x3a9, 0x20ac, 0x65e5, 0x1f600, 0x1f680, 0x7a]);
      const n = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      const u = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
      return {
        prompt: `Quantos bytes o ponto de código ${u} (${String.fromCodePoint(cp)}) ocupa em UTF-8?`,
        answer: n,
        unit: "bytes",
        explain: `Até U+007F, 1 byte; até U+07FF, 2; até U+FFFF, 3; acima, 4. ${u} cai na faixa de ${n} ${n === 1 ? "byte" : "bytes"}.`,
      };
    },
  },
];

export const cacheAssociativa: Practice[] = [
  {
    title: "Conjuntos e bits de índice",
    make(seed) {
      const d = dice(seed);
      const kib = d.pick([8, 16, 32, 64]);
      const line = d.pick([32, 64]);
      const ways = d.pick([2, 4, 8]);
      const sets = (kib * 1024) / line / ways;
      return {
        prompt: `Uma cache de ${kib} KiB tem linhas de ${line} bytes e é associativa de ${ways} vias. Quantos conjuntos ela tem?`,
        answer: sets,
        explain: `${kib} KiB ÷ ${line} B = ${(kib * 1024) / line} linhas; ÷ ${ways} vias = ${sets} conjuntos, ou ${Math.log2(sets)} bits de índice.`,
      };
    },
  },
  {
    title: "Tempo médio em dois níveis",
    make(seed) {
      const d = dice(seed);
      const l1 = d.pick([1, 2]);
      const m1 = d.pick([5, 10, 20]);
      const l2 = d.pick([4, 8, 10]);
      const m2 = d.pick([20, 30, 50]);
      const mem = d.pick([60, 80, 100]);
      const t = l1 + (m1 / 100) * (l2 + (m2 / 100) * mem);
      return {
        prompt: `L1 de ${l1} ns com ${m1}% de falhas, L2 de ${l2} ns com ${m2}% de falhas locais e memória de ${mem} ns. Qual o tempo médio por acesso, em ns? (duas casas)`,
        answer: t,
        tolerance: 0.01,
        unit: "ns",
        explain: `${l1} + ${num(m1 / 100)} × (${l2} + ${num(m2 / 100)} × ${mem}) = ${l1} + ${num(m1 / 100)} × ${num(l2 + (m2 / 100) * mem)} = ${num(t)} ns.`,
      };
    },
  },
];

export const desempenho: Practice[] = [
  {
    title: "Tempo de CPU",
    make(seed) {
      const d = dice(seed);
      const mi = d.pick([200, 500, 800, 1000, 2000]);
      const cpi = d.pick([1.2, 1.5, 2, 2.5, 3]);
      const ghz = d.pick([2, 2.5, 3, 4]);
      const s = (mi * 1e6 * cpi) / (ghz * 1e9);
      return {
        prompt: `Um programa executa ${big(mi)} milhões de instruções com CPI médio ${num(cpi)} numa CPU de ${num(ghz)} GHz. Quantos segundos leva? (três casas)`,
        answer: s,
        tolerance: 0.001,
        unit: "s",
        explain: `${big(mi)} × 10⁶ × ${num(cpi)} ÷ (${num(ghz)} × 10⁹) = ${num(s, 3)} s.`,
      };
    },
  },
];
