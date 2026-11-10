# redes/mac-sem-colisao

- Mapa de bits, 8 estações, prontas 1, 3, 7: disputa 0 1 0 1 0 0 0 1; transmitem 1, 3, 7.
  8 bits por rodada (8/3 ≈ 2,7 por quadro).
- Ficha a partir da 2: 2, 3, 4, 5, 6, 7, 0, 1 → prontas na ordem 3, 7, 1; 8 passagens.
- Contagem binária com 0010, 0100, 1001, 1010:
  bit 1: 0 0 1 1 → OU 1 → saem 0010 e 0100. bit 2: 0 0 → 0. bit 3: 0 1 → 1 → sai 1001.
  bit 4: 0 → 0. Vence 1010 (exemplo do CN 4.2.3).
- Eficiência com 1024 estações e quadros de 100 bits: mapa com 1 pronta 100 / 1124 = 8,9%; com todas, 102400 / 103424 = 99,0%; contagem binária 100 / (100 + 10) = 90,9% (quiz s5).

Para o dono conferir:

- [x] CN 4.2.3 (mapa de bits, passagem de ficha, contagem binária com 0010, 0100, 1001, 1010).
