# so/substituicao-paginas

Sequência 2 3 2 1 5 2 4 5 3 2 5 2, 3 quadros. Quadros na ordem de preenchimento; F = falta.

FIFO (9 faltas): 2F 3F 2 1F | 5F sai 2 | 2F sai 3 | 4F sai 1 | 5 | 3F sai 5 | 2 | 5F sai 2 | 2F sai 4.

Ótimo (6 faltas): 2F 3F 2 1F | 5F sai 1 (nunca mais usada) | 2 | 4F sai 2 (próximo uso no 10º
acesso, o mais distante) | 5 | 3 | 2F sai 4 (empate entre 4 e 3, nunca mais usadas: sai o
primeiro quadro) | 5 | 2.

LRU (7 faltas): 2F 3F 2 1F | 5F sai 3 (último uso no 2º acesso) | 2 | 4F sai 1 | 5 | 3F sai 2 |
2F sai 4 | 5 | 2.

Relógio (8 faltas), R = 1 ao carregar ou usar, ponteiro avança ao carregar:
2F 3F 2 1F (R 111, ponteiro 0) | 5F: zera os três, volta ao 0 e tira o 2 (R 100, p 1) |
2F tira 3 (R 110, p 2) | 4F tira 1 (R 111, p 0) | 5 | 3F: zera os três, tira o 5 (R 100, p 1) |
2 (R 110) | 5F: zera o 2, tira o 4 (R 101, p 0) | 2.

Belady, cadeia 1 2 3 4 1 2 5 1 2 3 4 5: FIFO com 3 quadros 9 faltas, com 4 quadros 10.
LRU na mesma cadeia: 12, 12, 10, 8, 5, 5 faltas para 1 a 6 quadros (nunca sobe).

Para o dono conferir:

- [x] MOS 3.4 e Maziero 17.3, 17.4.1 e 17.6;
- [x] a convenção do relógio (R = 1 ao carregar) bate com a usada em aula.
