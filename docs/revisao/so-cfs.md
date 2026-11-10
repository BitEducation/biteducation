# so/cfs

Pesos (sched_prio_to_weight): nice 0 = 1024, nice 5 = 335. Cada ms real soma 1024/peso ao
vruntime: 1 para nice 0, 1024/335 = 3,06 para o backup. Empate: vence a tarefa de menor índice.

- ms 0–15 (editor, compilador, backup): E C B E C E C E C B E C E C E C → 7, 7, 2.
  Prometido ao backup: 335 / (1024 + 1024 + 335) = 14%.
- ms 16, novato no mínimo: vruntimes 7, 7, 6,11 → o player entra com 6,11. Daí até o ms 32 não
  há rajada maior que 1 ms; totais 12, 11, 4, 5.
- Novato em zero: o player roda do ms 16 ao 23 (7 ms seguidos); totais 10, 10, 3, 9.
- Laboratório: pesos da tabela do kernel −10 → 9548, −5 → 3121, 0 → 1024, 5 → 335, 10 → 110. Com nice 10, cada ms do backup vale 1024 / 110 = 9,31 ms virtuais.

Para o dono conferir:

- [x] MOS 10.3.4 (CFS, árvore rubro-negra).
- [x] Linux 6.6 (2023) troca CFS por EEVDF; tabela de pesos em kernel/sched/core.c.
