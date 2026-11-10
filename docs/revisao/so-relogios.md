# so/relogios

Cristal 1.193.182 Hz, HZ = 250, tratador de 2 µs.

- Carga: 1.193.182 ÷ 250 = 4772,7 → 4773; tique = 4773 ÷ 1.193.182 s = 4,000 ms.
- Custo: 250 × 2 µs = 500 µs por segundo = 0,05%.
- Alarmes em tiques de 4 ms, arredondando para cima: navegador 20 → 5 (20 ms, atraso 0);
  player 30 → 8 (32, +2); compilador 45 → 12 (48, +3) (quiz: 48 ms); editor 50 → 13 (52, +2);
  planilha 51 → 13 (52, +1). Diferenças: 5, 3, 4, 1, 0. Atrasados: 4; pior 3 ms.
- Com HZ = 1000: tudo exato. Com HZ = 100: 20, 30, 50, 50, 60.
- Quiz s1: 1.193.182 ÷ 250 = 4772,7 → 4773 (tolerância de 1).

Para o dono conferir:

- [x] MOS 5.5 (hardware de relógio, fila de alarmes como diferenças).
