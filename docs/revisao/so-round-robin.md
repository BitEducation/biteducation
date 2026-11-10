# so/round-robin

Exemplo do tour: editor (chega em 0, CPU 5), compilador (1, 9), player (2, 2), quantum 3,
troca de contexto de 1 tick. Regra: quem chega durante um quantum entra na fila **antes** de
quem acabou de ser preemptado. Quando só resta um processo, não há troca.

| Intervalo | CPU | Fila ao fim do intervalo |
|---|---|---|
| 0–3 | editor (falta 2) | compilador, player, editor |
| 3–4 | troca | |
| 4–7 | compilador (falta 6) | player, editor, compilador |
| 7–8 | troca | |
| 8–10 | player (termina) | editor, compilador |
| 10–11 | troca | |
| 11–13 | editor (termina) | compilador |
| 13–14 | troca | |
| 14–20 | compilador (termina; sem troca no tick 17) | |

| Processo | Fim | Retorno = fim − chegada | Espera = retorno − CPU | Resposta |
|---|---|---|---|---|
| editor | 13 | 13 | 8 | 0 |
| compilador | 20 | 19 | 10 | 3 |
| player | 10 | 8 | 6 | 6 |
| **Média** | | **13,33** | **8** | **3** |

Uso da CPU: 16 ticks úteis em 20 = 80%. Trocas: 4.

Passo 7 (comparação): com quantum 20 o RR vira FCFS: editor 0–5, troca, compilador 6–15,
troca, player 16–18; esperas 0, 5 e 14, média 6,33, 2 trocas.

Exemplos de referência do simulador (`src/sim/os/sched.test.ts`), do Silberschatz, cap. 5:
P1 = 24, P2 = 3, P3 = 3 chegando em 0. FCFS: esperas 0, 24, 27 (média 17). SJF: 6, 0, 3.
RR com q = 4: P1 0–4, P2 4–7, P3 7–10, P1 10–30; esperas 6, 4, 7.

Para o dono conferir:

- [x] capítulo e seção das referências (Tanenbaum MOS, Silberschatz, OSTEP);
- [x] a convenção "chegada entra antes do preemptado" é a do livro usado na disciplina.
