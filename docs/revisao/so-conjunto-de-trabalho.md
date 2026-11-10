# so/conjunto-de-trabalho

Referências: (1 2 3 4) × 6, (5 6 7 8) × 6, (1 2 9 10) × 6 → 72. Δ = 8. Disco: 6 unidades por
falta; cada referência, 1 unidade de CPU. 24 quadros.

- Conjunto de trabalho: 4 dentro de cada laço; na troca, a janela de 8 mistura os dois laços e
  chega a 8 (refs 25–28 da janela 21–28 têm 1 2 3 4 5 6 7 8).
- LRU com 4 quadros: 4 faltas frias por laço → 12. Com 3: laço de 4 páginas com LRU falta
  sempre → 72 (quiz: 4 quadros). Com 8: 4 + 4 + 2 (9 e 10) = 10.
- Carga: k = 1 → 24 quadros, 10 faltas; sozinho = 72 + 10 × 6 = 132 → 72 ÷ 132 = 55%.
  k = 2 → 12 quadros, CPU 144, disco 120, sozinho 132 → 100%. Até k = 6 (4 quadros cada,
  12 faltas: CPU 432 = disco 432) → 100%.
  k = 7 → ⌊24 ÷ 7⌋ = 3 quadros, 72 faltas; disco 7 × 72 × 6 = 3024; CPU 504 → 17%.
- Admissão: 24 ÷ 4 = 6 processos.
- Quiz s5: 24 quadros ÷ 4 páginas = 6 processos.

Para o dono conferir:

- [x] MOS 3.4.8 (conjunto de trabalho) e 3.5.2 (controle de carga); Maziero 17.5 e 17.7 (thrashing).
