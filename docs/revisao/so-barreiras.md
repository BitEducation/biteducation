# so/barreiras

Trabalho (tiques) por thread e fase: T1 4 5 3, T2 6 2 4, T3 3 4 6, T4 5 5 2. Na fase k+1, Ti lê o
resultado de T(i+1) da fase k (T4 lê T1).

- Sem barreira, fins de fase: T1 4, 9, 12; T2 6, 8, 12; T3 3, 7, 13; T4 5, 10, 12.
  Fase 2: T1 começa em 4, T2 acaba a fase 1 em 6 → velho; T2 em 6, T3 em 3 → ok; T3 em 3, T4 em 5
  → velho; T4 em 5, T1 em 4 → ok. Fase 3: T1 9 vs T2 8 ok; T2 8 vs T3 7 ok; T3 7 vs T4 10 →
  velho; T4 10 vs T1 9 ok. Total 3.
- Com barreira: fases de 6, 5 e 6 → fins 6, 11, 17 (quiz: 17).
  Espera: fase 1: 2 + 0 + 3 + 1 = 6; fase 2: 0 + 3 + 1 + 0 = 4; fase 3: 3 + 2 + 0 + 4 = 9 → 19.
  19 ÷ (4 × 17 = 68) = 27,9% → 28%. Trabalho útil: 68 − 19 = 49 = soma das durações.
- Quiz s4: máximos por fase 6, 5 e 6 → 17 tiques.

Para o dono conferir:

- [x] MOS 2.3.9 (barreiras); Maziero cap. 12, exercício da barreira.
