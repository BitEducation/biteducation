# redes/roteamento

Topologia: A–B 1, B–C 2, A–C 7 (Laboratório, padrão), C–D 1. Vetor de distância síncrono:
em cada rodada (30 s) cada roteador recalcula com os vetores que os vizinhos tinham na rodada
anterior, `D_x(y) = min_v c(x,v) + D_v(y)`, sem horizonte dividido. Infinito = 16 (RIP).
Empate: vence o vizinho listado primeiro (A olha B antes de C).

Convergência, tabela de A:

| Rodada | B | C | D |
|---|---|---|---|
| 0 | 1 via B | 7 via C | ∞ |
| 1 | 1 via B | 3 via B (1 + 2 < 7) | 8 via C (7 + 1; B ainda não conhecia D) |
| 2 | 1 via B | 3 via B | 4 via B (1 + 3) |

Rodada 3 não muda nada: 2 rodadas até convergir. O menor custo A→D é 4 (A–B–C–D),
resposta do quiz do passo 3.

Encaminhamento (passo 4): rota padrão anunciada por B, 10.30.0.0/16 por D, 10.30.5.0/24 por C.
10.30.5.9 combina com as três; vence /24, que sai por B (próximo salto de A rumo a C).

Falha de B–C (passo 5), partindo das tabelas convergidas:

| Rodada | A→D | B→D | B→C | Laço A↔B para D? |
|---|---|---|---|---|
| 1 | 4 via B | 5 via A (1 + 4) | 4 via A | sim |
| 2 | 6 via B | 5 via A | 4 via A | sim |
| 3 | 6 via B | 7 via A | 6 via A | sim |
| 4 | 8 via B (empate com 7 + 1 via C) | 7 via A | 6 via A | sim |
| 5 | 8 via B | 9 via A | 8 via A | sim |
| 6 | 8 via C | 9 via A | 8 via A | não |

6 rodadas (180 s) para reconvergir, 5 delas com laço. Resultado final A→D = 8 via C, igual ao
Dijkstra na topologia sem B–C (ordem A, B, C, D; custos 0, 1, 7, 8). A tabela de
encaminhamento acompanha: /16 (de D) e /24 (de C) passam a sair por C; a rota padrão continua por B.

Laboratório: com A–C = 15 o caminho alternativo custa 16, que é o infinito; D fica
inalcançável para A depois da falha. Com A–C ≤ 2 não há laço.

Para o dono conferir:

- [x] capítulo e seções do Tanenbaum (5.2.4, 5.2.5, 5.7.2);
- [x] o modelo de rodadas síncronas como simplificação aceitável para a turma.
