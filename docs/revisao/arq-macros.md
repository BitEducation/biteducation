# arq/macros

Corpo da macro: 4 instruções. 3 usos. Procedimento: corpo + ret; cada uso faz 2 mv + call.

- Expansão: 3 × 4 = 12 instruções; o primeiro uso vira lw t0, 0(a0); lw t1, 0(a1);
  sw t1, 0(a0); sw t0, 0(a1).
- Tamanho com k usos: macro 4k; procedimento 4 + 1 + 3k. k = 3: 12 contra 14.
- Empate: 4k ≤ 5 + 3k → k ≥ 5 (20 contra 20) (quiz).
- Executadas com 3 usos: macro 12; procedimento 3 × (2 + 1 + 4 + 1) = 24.
- Quiz s3: 5 usos × 4 instruções = 20.

Para o dono conferir:

- [x] SCO 7.2 (macros).
