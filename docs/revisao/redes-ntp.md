# redes/ntp

Hora certa 5000 ms; cliente −250 ms; 20 ms em cada sentido; servidor gasta 1 ms.

- T1 = 5000 − 250 = 4750 (cliente). T2 = 5020, T3 = 5021 (servidor). T4 = 5041 − 250 = 4791 (cliente).
- δ = (4791 − 4750) − (5021 − 5020) = 41 − 1 = 40 ms (quiz).
- θ = ((5020 − 4750) + (5021 − 4791)) / 2 = (270 + 230) / 2 = +250 ms = correção exata.
- Ida 50, volta 20: T2 = 5050, T3 = 5051, T4 = 5071 − 250 = 4821. θ = (300 + 230) / 2 = 265; erro +15 = (50 − 20)/2.
  δ = 71 − 1 = 70; limite δ/2 = 35.
- 8 consultas com fila aleatória de 0 a 39 ms por sentido (semente 7): a de menor δ é a 1ª (42 ms), erro −1 ms;
  erro médio absoluto 3,4 ms.
- |θ| = 250 > 128 → salto. Com +100 ms adiantado: θ = −100 → ajuste a 500 ppm = 0,5 ms/s → 200 s.

Estratos: GPS (0) → servidor (1) → cliente (2).

Para o dono conferir:

- [x] RFC 5905, seções 8 e 10 (fórmulas de atraso e deslocamento; filtro de relógio).
