# Revisão: arq/simd-gpu

Padrão: 18 pixels, 4 pistas (128 bits = 4 × 32), limiar 50.

Brilhos: pixel i = (37 i + 11) mod 100 → 11 48 85 22 | 59 96 33 70 | 7 44 81 18 | 55 92 29 66 | 3 40.

## Instruções

- Escalar: 18 somas.
- 4 pistas: ⌈18 / 4⌉ = 5 instruções; 4 cheias e a última com 2 pixels (2 pistas vazias).
  Pistas úteis: 18 / 20 = 90%.

## Desvio (claro ≥ 50 escurece, escuro clareia)

| Grupo | Pixels | Claros? | Caminhos |
| --- | --- | --- | --- |
| 1 | 11 48 85 22 | só o 85 | 2 |
| 2 | 59 96 33 70 | 59 96 70 | 2 |
| 3 | 7 44 81 18 | só o 81 | 2 |
| 4 | 55 92 29 66 | 55 92 66 | 2 |
| 5 | 3 40 | nenhum | 1 |

9 instruções, 18 / (9 × 4) = 50% das pistas úteis. 4 grupos misturados.

## Claros antes dos escuros

8 claros: grupos [4 claros] [4 claros] [4 escuros] [4 escuros] [2 escuros] → 5 instruções, 18 / 20 = 90%.

## Para o dono conferir

- [x] A grade mostra as quatro linhas (brilho, escalar, vetor, caminho) legíveis com 24 pixels.
- [x] A explicação de warp e divergência está correta para GPUs atuais.
- [x] 8 pistas com 9 pixels no Lab: textos de sobra coerentes.
