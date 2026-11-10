# Revisão: arq/cache-associativa

8 linhas de 16 B, endereço de 16 bits. Blocos: A 0x1000, B 0x1080, C 0x1100, D 0x1010.
Sequência: A B A B C A B A D A B C.

- Direta (índice = bits 4–6): A, B, C → linha 0; D → linha 1. Só a leitura 10 (A, logo depois de A na 8,
  porque D foi para a linha 1) acerta: 1 acerto, 4 compulsórias, 7 de conflito.
- 2 vias (4 conjuntos, índice = bits 4–5): A, B, C no conjunto 0. Acertos: leituras 3, 4, 8, 10, 11 → 5.
- 4 vias (2 conjuntos): A, B, C cabem no conjunto 0 → só 4 compulsórias → 8 acertos. 8 vias: idem.
- Tempo médio (L1 1 ns, 10%; L2 4 ns, 40%; L3 12 ns, 50%; memória 80 ns):
  12 + 0,5 × 80 = 52; 4 + 0,4 × 52 = 24,8; 1 + 0,1 × 24,8 = 3,48 ns.

## Para o dono conferir

- [x] Faixas típicas: L1 32–48 KiB e 8–12 vias, L2 1–2 MiB, L3 dezenas de MiB.
