# redes/diffie-hellman

p = 23, g = 5, a = 6, b = 15.

- Potências de 5 mod 23: 5, 2, 10, 4, 20, 8, 17, 16, 11, 9, 22, 18, 21, 13, 19, 3, 15, 6, 7, 12, 14, 1
  (22 valores distintos: 5 é gerador).
- A = 5⁶ mod 23 = 15625 mod 23 = 15625 − 679 × 23 = 8 (quiz).
- B = 5¹⁵ mod 23: 5² = 2, 5⁴ = 4, 5⁸ = 16; 16 × 4 × 2 × 5 = 640; 640 − 27 × 23 = 19.
- Chave de Ana: 19⁶ mod 23: 19² = 361 → 16; 19⁴ = 16² = 256 → 3; 3 × 16 = 48 → 2 (quiz).
- Chave de Bruno: 8¹⁵ mod 23: 8² → 18, 8⁴ → 2, 8⁸ → 4; 4 × 2 × 18 × 8 = 1152 → 2. Igual.
- Eva: 5¹ ... 5⁶; acha 8 na 6ª tentativa.
- No meio, com e = 3: E = 125 mod 23 = 10. Ana: 10⁶ mod 23: 10² → 8, 10⁴ → 18, 18 × 8 = 144 → 6.
  Bruno: 10¹⁵: 10⁸ → 2; 2 × 18 × 8 × 10 = 2880 → 5. Chaves 6 e 5, diferentes.

Para o dono conferir:

- [x] CN 8.9.2.
