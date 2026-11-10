# Revisão: arq/desempenho

Mistura sem otimizar (milhões): 500 aritméticas, 300 de memória, 200 desvios = 1.000.
Otimizado: 300, 300, 200 = 800.

- A (3 GHz; CPI 1, 4, 2): ciclos = 500 + 1.200 + 400 = 2.100 mi → CPI 2,1 → 2.100 ÷ 3.000 = 0,7 s. MIPS = 3.000 ÷ 2,1 = 1.429.
- B (4 GHz; CPI 1, 5, 4): ciclos = 500 + 1.500 + 800 = 2.800 → CPI 2,8 → 2.800 ÷ 4.000 = 0,7 s. Empate.
- A otimizado: ciclos = 300 + 1.200 + 400 = 1.900 → CPI 2,375 → 0,633 s. MIPS = 3.000 ÷ 2,375 = 1.263 (caiu).
- Memória nos ciclos de A: 1.200 ÷ 2.100 = 57%.

## Para o dono conferir

- [x] O exemplo de MIPS caindo com o código otimizado está claro.
