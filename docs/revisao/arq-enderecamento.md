# arq/enderecamento

Memória: 100 = 7, 104 = 120, 108 = 42, 112 = 5, 116 = 116, 120 = 13, 124 = 8, 128 = 99. r2 = 100, deslocamento 8.

| Modo | Escrito | Operando | Leituras |
| --- | --- | --- | --- |
| Imediato | #104 | 104 | 0 |
| Direto | 104 | M[104] = 120 | 1 |
| Registrador | r2 | 100 | 0 |
| Indireto por registrador | (r2) | M[100] = 7 | 1 |
| Base + deslocamento | 8(r2) | M[108] = 42 (quiz) | 1 |
| Indireto pela memória | @104 | M[M[104]] = M[120] = 13 | 2 (quiz) |

Vetor a partir de 100, 4 palavras: 7, 120, 42, 5; somas 7, 127, 169, 174.

Extremo r2 = 128: o deslocamento é limitado a 0 e o vetor tem uma palavra só (99).

Para o dono conferir:

- [x] SCO 5.4.
