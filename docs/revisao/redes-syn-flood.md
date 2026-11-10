# redes/syn-flood

Lição de ataque: passo de sinais (s4) e de defesa (s5, s6). Só simulação.

Parâmetros: fila de 8 vagas, cada entrada sem ACK dura 5 s, 4 SYNs forjados por segundo a
partir de 2 s, tempo em segundos inteiros.

| Segundo | Chegam | Na fila | Descartados (acumulado) |
|---|---|---|---|
| 0 | SYN da Lia | 1 | 0 |
| 1 | ACK da Lia: conexão criada, sai da fila | 0 | 0 |
| 2 | 4 forjados | 4 | 0 |
| 3 | 4 forjados | **8 (cheia)** | 0 |
| 4 | 4 forjados | 8 | 4 (primeiro descarte aos 4 s) |
| 5 | 4 forjados | 8 | 8 |
| 6 | 4 forjados + SYN da Lia | 8 | 13 (a Lia é recusada) |
| 7 | as 4 de 2 s expiram, 4 novas ocupam | 8 | 13 |

Quiz: o mínimo para manter a fila cheia é 8 vagas ÷ 5 s = 1,6 SYN/s, então 2 por segundo.

SYN cookie (`sim/net/synflood.ts`): 5 bits de contador de tempo, 3 bits de índice da tabela de
MSS (índice 3 = 1460) e 24 bits de hash com segredo (FNV-1a na lição; SipHash no Linux). O ACK
da Lia traz cookie + 1; o servidor recalcula e cria a conexão sem usar a fila.

Para o dono conferir:

- [x] RFC 4987 e BCP 38 (RFC 2827);
- [x] o layout do cookie contra a descrição do D. J. Bernstein / Linux usada em aula.
