# arq/flip-flops

Latch SR com duas NOR: Q = NOR(R, Q̄), Q̄ = NOR(S, Q); as duas portas avaliadas juntas a cada rodada.

- Início Q = 0, Q̄ = 1, S = R = 0: NOR(0,1) = 0 e NOR(0,0) = 1, estável.
- S = 1: rodada 1 → Q = NOR(0,1) = 0, Q̄ = NOR(1,0) = 0; rodada 2 → Q = NOR(0,0) = 1, Q̄ = NOR(1,0) = 0;
  rodada 3 não muda. 2 atrasos. Quiz: 2.
- S volta a 0 com Q = 1, Q̄ = 0: NOR(0,0) = 1, NOR(0,1) = 0, estável (guarda o 1).
- R = 1: Q̄ = 0 → Q = 0, depois Q̄ = 1. S = R = 1: Q = Q̄ = 0.
- Soltar os dois a partir de 0/0: NOR(0,0) = 1 nas duas → 1/1 → 0/0 → … oscila (6 rodadas no modelo).

Formas de onda, período 4 (clock alto nos ticks 2–3, 6–7, 10–11, 14–15), D = 0110001110011000:

| t | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
|---|---|---|---|---|---|---|---|---|---|---|----|----|----|----|----|----|
| CLK | 0 | 0 | 1 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 1 | 1 |
| D | 0 | 1 | 1 | 0 | 0 | 0 | 1 | 1 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | 0 |
| latch | 0 | 0 | 1 | 0 | 0 | 0 | 1 | 1 | 1 | 1 | 0 | 1 | 1 | 1 | 0 | 0 |
| flip-flop | 0 | 0 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |

Latch muda em 2, 3, 6, 10, 11 e 14: 6 vezes. D muda com clock alto no tick 3.
Flip-flop amostra nas bordas 2, 6, 10, 14: D = 1, 1, 0, 0 → muda em 2 e 10: 2 vezes. Quiz: 2.

Contador de 4 bits a partir de 13: 14, 15, 0, 1. Quiz: 13 + 4 = 17 − 16 = 1.

Laboratório: D = 0101… → bordas pares leem 0, flip-flop não muda; latch muda 7 vezes.

Para o dono conferir:

- [x] Tanenbaum SCO 3.3.1 a 3.3.3.
