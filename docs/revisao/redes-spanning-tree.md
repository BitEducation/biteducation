# redes/spanning-tree

Switches S1–S4 (MAC 01–04), prioridade 32768. Enlaces: S1–S2, S1–S3, S2–S4, S3–S4 custo 4; S2–S3 custo 19.

- Tempestade: o PC manda um broadcast a S2, que tem 3 enlaces → 3 cópias. Cada cópia sai por todos os
  enlaces menos o de entrada: 3 → 4 → 6 → 10 → 14 → 22 (o teste confere num triângulo: 2 sempre).
- Raiz: menor ID = S1 (32768.01). Com S4 em prioridade 0, a raiz é S4.
- Custos: S2 = 4 (via S1), S3 = 4 (via S1), S4 = 8: empate via S2 ou S3; vence o vizinho de menor ID, S2.
- Designadas: S3–S4 → S3 (4 < 8), S4 bloqueia; S2–S3 → empate 4 = 4, S2 (menor ID), S3 bloqueia.
  2 bloqueados = 5 enlaces − (4 − 1) (quiz).
- S1–S2 cai: S2 passa a 12 via S1–S3–S4–S2 (melhor que 4 + 19 = 23); S3–S4 é liberado. Fica bloqueado S2–S3.

Para o dono conferir:

- [x] CN 4.7.3.
