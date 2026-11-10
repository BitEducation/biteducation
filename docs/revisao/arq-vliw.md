# arq/vliw

Latências: ld 2, mul 3, add 1, st 1. Operações 1–4 ld; 5 = 1 × 2; 6 = 3 × 4; 7 = 5 + 6; 8 st 7.

- Escalar em ordem: 1–4 nos ciclos 0–3; 5 no 4 (1 e 2 prontos em 2 e 3); 6 no 5 (4 pronto em 5);
  7 espera 6 (pronta em 8) → ciclo 8; 8 no 9 → fim em 10.
- 3 vias: ciclo 0 [1,2,3]; 1 [4]; 2 [5] (1, 2 prontos em 2); 3 [6] (4 pronto em 3); 4 e 5 vazios;
  6 [7] (6 pronta em 6); 7 [8] → 8 pacotes, fim em 8. Vias: 8 × 3 = 24, NOPs 24 − 8 = 16 (quiz),
  16 ÷ 24 = 67%.
- 4 vias: [1,2,3,4], vazio, [5,6], vazio, vazio, [7], [8] → 7 ciclos.
- Desvio com erro de 50% e penalidade 10: 1 + 1 + 1 + 10 × 0,5 = 8 ciclos; predicado: 2.
- Quiz s4: 3 + 10 × 0,5 = 8 ciclos em média; predicado 2.

Para o dono conferir:

- [x] SCO 5.8 (IA-64: pacotes, predicação).
