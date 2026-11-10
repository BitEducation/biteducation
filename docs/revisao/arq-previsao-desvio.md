# arq/previsao-desvio

Laço de 4 voltas executado 3 vezes: o desvio do fim dá T T T N, três vezes (12 execuções). Penalidade 3 ciclos.

Sempre toma: erra só os 3 N. Acerto 9/12 = 75%; 9 ciclos.

1 bit, começando em N: em cada entrada erra a primeira volta (bit em N) e a saída (bit em T). 2 × 3 = 6 erros;
50%; 18 ciclos. Quiz do passo 3: 6.

2 bits, começando em 01: 1ª rodada T (prevê N, erra, 01→10), T (acerta, 11), T (11), N (prevê T, erra, 11→10).
Nas rodadas seguintes, T acerta (10→11), T, T, N erra. Total 1 + 3 = 4 erros; 67%; 12 ciclos. O erro a mais
em relação ao "sempre toma" é o de aquecimento.

Dados (semente 754, 16 valores de 0 a 255): o if (v >= 128) com 2 bits erra 7 vezes na ordem sorteada.
Ordenados: todos os N primeiro (acertos), depois os T: erra os dois primeiros T (01→10, 10→11); 2 erros.

O teste confere as contagens do laço e, num laço de 5 voltas executado 4 vezes: 4, 8 e 5 erros.

Para o dono conferir:

- [x] SCO 4.5.2 e 4.5.4.
