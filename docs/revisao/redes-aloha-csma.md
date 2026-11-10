# redes/aloha-csma

Carga G = 0,5 (padrão).

- ALOHA puro: G e^(−2G) = 0,5 × e^(−1) = 0,5 × 0,3679 = 0,1839 → 18,4%. Pico em G = 0,5.
- Com slots: G e^(−G) = 0,5 × 0,6065 = 0,3033 → 30,3% (quiz). Pico em G = 1: 1/e = 36,8%.
  Em G = 3: 3 × e^(−3) = 3 × 0,0498 = 14,9%.
- Simulação de 20 slots (semente 12): 6 úteis, 1 com colisão, 13 vazios. Esperado: 20 × 0,303 = 6,1
  úteis; 20 × 0,607 = 12,1 vazios; 1,8 com colisão.
- CSMA/CD, 10 Mbit/s, cabo 2500 m, c = 2 × 10⁸ m/s: 2BLe ÷ cF.
  - 64 bytes (512 bits): 2 × 10⁷ × 2500 × 2,718 ÷ (2 × 10⁸ × 512) = 1,327; 1 ÷ 2,327 = 43,0%.
  - 1500 bytes (12 000 bits): 0,0566; 1 ÷ 1,0566 = 94,6%.
- Slot: 512 bits ÷ 10 Mbit/s = 51,2 µs. Recuo: 1 colisão 0–1 (média 25,6 µs); 2: 0–3 (76,8 µs);
  3: 0–7 (179,2 µs); 4: 0–15 (384 µs); 10: 0–1023 (26 188,8 µs → "26,19 ms").

Para o dono conferir:

- [x] CN 4.2.1, 4.2.2 e 4.3.3.
