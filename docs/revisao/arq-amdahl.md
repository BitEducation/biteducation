# arq/amdahl

Trabalho de 100 s, f = 0,9 (10 s serial, 90 s paralela), n = 8.

- Tempo com 8 núcleos: 10 + 90 ÷ 8 = 10 + 11,25 = 21,25 s (quiz).
- Speedup: 100 ÷ 21,25 = 1 ÷ (0,1 + 0,1125) = 4,7059 → 4,71×.
- Eficiência: 4,7059 ÷ 8 = 0,5882 → 58,8%.
- Tabela: 2 núcleos 10 + 45 = 55 s (1,82×); 4 núcleos 10 + 22,5 = 32,5 s (3,08×).
- Teto: 1 ÷ 0,1 = 10× (quiz). Com 64: 1 ÷ (0,1 + 0,0140625) = 8,767 → 8,77×, 88% do teto.
- Frações com 8 núcleos: 50% → 1 ÷ (0,5 + 0,0625) = 1,78×; 75% → 1 ÷ (0,25 + 0,09375) = 2,91×;
  95% → 1 ÷ (0,05 + 0,11875) = 5,93×; 99% → 1 ÷ (0,01 + 0,12375) = 7,48×, teto 100×.
- Gustafson: 0,1 + 0,9 × 8 = 7,3×.

Para o dono conferir:

- [x] SCO 8.4.7 (lei de Amdahl).
