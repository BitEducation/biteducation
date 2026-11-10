# Revisão: arq/fora-de-ordem

Padrão: lw leva 5 ciclos; as outras 1, menos o mul (3). Uma instrução começa por ciclo; o
resultado pode ser usado no ciclo em que fica pronto.

| | Instrução | Lat. | Depende de |
| --- | --- | --- | --- |
| I1 | lw x1, 0(x10) | 5 | – |
| I2 | add x2, x1, x3 | 1 | x1 de I1 (RAW) |
| I3 | mul x3, x4, x5 | 3 | x3, que I2 lê (WAR) |
| I4 | add x6, x4, x5 | 1 | – |
| I5 | sub x2, x6, x4 | 1 | x6 de I4 (RAW); x2 (WAW) |
| I6 | addi x7, x7, 1 | 1 | – |

## Início → pronto

| | Em ordem | Sem renomear | Renomeando |
| --- | --- | --- | --- |
| I1 | 0 → 5 | 0 → 5 | 0 → 5 |
| I2 | 5 → 6 | 5 → 6 | 5 → 6 |
| I3 | 6 → 9 | 6 → 9 (WAR: espera I2 começar) | 1 → 4 |
| I4 | 7 → 8 | 1 → 2 | 2 → 3 |
| I5 | 8 → 9 | 7 → 8 (WAW: espera I2 terminar; no 6 começa I3) | 3 → 4 |
| I6 | 9 → 10 | 2 → 3 | 4 → 5 |
| Último | 10 | 9 | 6 |

Em ordem, I2 espera do ciclo 1 ao 5: 4 ciclos.

## Retirada (renomeando)

retira_i = max(pronta_i, retira_{i−1}): 5, 6, 6, 6, 6, 6. I3, I4 e I5 ficam prontas antes do lw (5).

## Para o dono conferir

- [x] As regras WAR (espera o leitor começar) e WAW (espera o escritor anterior terminar) estão claras.
- [x] A tabela de renomeação (P1…P6) bate com o passo 4.
- [x] Latência 1 no Lab: os três modelos empatam e os textos ficam coerentes.
