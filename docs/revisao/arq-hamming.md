# arq/hamming

Dados 13 = 1101 → posições 3 = 1, 5 = 1, 6 = 0, 7 = 1. Paridade simples: 3 uns → 1.

- p1 (1, 3, 5, 7): 1 ⊕ 1 ⊕ 1 = 1;
- p2 (2, 3, 6, 7): 1 ⊕ 0 ⊕ 1 = 0;
- p4 (4, 5, 6, 7): 1 ⊕ 0 ⊕ 1 = 0.

Palavra (posições 1 a 7): 1 0 1 0 1 0 1 = 1010101.

Erro na posição 6: recebido 1010111.

- p1: 1 + 1 + 1 + 1 = 4, par, confere;
- p2: 0 + 1 + 1 + 1 = 3, falha;
- p4: 0 + 1 + 1 + 1 = 3, falha.

Síndrome 2 + 4 = 6 (quiz). Invertendo a 6: 1010101, dados 1101.

Dois erros (3 e 5): a síndrome é 3 ⊕ 5 = 6, e o código inverte o bit 6, que estava certo.

ECC de 64 bits: menor r com 2^r ≥ 64 + r + 1 é 7; mais uma paridade geral = 8 (72 bits por palavra, 12,5%).

O teste confere que, para os 16 dados e as 7 posições, a síndrome aponta a posição trocada.

Para o dono conferir:

- [x] SCO 2.2.4.
