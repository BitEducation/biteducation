# redes/janela-deslizante

Linha de 1 Mbit/s, quadro de 8000 bits: 8000 ÷ 1 000 000 = 8 ms. RTT 40 ms.

- Parar e esperar: 8 ÷ (8 + 40) = 16,7% (quiz).
- Janela 4: 4 × 8 ÷ 48 = 66,7%. Janela que enche: 1 + 40 ÷ 8 = 6.
- 8 quadros, janela 4, quadro 2 perdido.
  - Go-Back-N: primeira leva 0–5 (0, 1 entregues; 2 perdido; 3, 4, 5 descartados) = 6 envios;
    depois 2–7 = 6; total 12 (quiz), 4 a mais.
  - Repetição seletiva: 0–5 (3, 4, 5 guardados), 2 de novo, 6, 7 = 9 envios, 1 a mais.
- 3 bits: números 0–7; Go-Back-N até 7, seletiva até 4. 2 bits: 3 e 2; 4 bits: 15 e 8.

Extremos: janela 1, perda do 0: GBN 1 + 8 = 9; janela 8, perda do 0: GBN 8 + 8 = 16, seletiva 9.

Para o dono conferir:

- [x] CN 3.4.
