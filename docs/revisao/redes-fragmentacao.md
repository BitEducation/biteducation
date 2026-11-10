# redes/fragmentacao

- 4000 = 20 + 3980. MTU 1500 → 1480 de dados por fragmento (1480 / 8 = 185, múltiplo de 8).
- 3980 = 1480 + 1480 + 1020. Deslocamentos 0, 185, 370; MF 1, 1, 0; totais 1500, 1500, 1040.
- Perda 1% por fragmento: 1 − 0,99³ = 0,029701 → 2,97%.
- R3 com MTU 576: 556 bytes de dados, arredondados para 552 (69 × 8).
- 1480 = 552 + 552 + 376 → deslocamentos 0, 69, 138; 1480 → 185, 254, 323; 1020 = 552 + 468 → 370, 439.
- Oito fragmentos com perda de 1% cada: 1 − 0,99⁸ = 0,0773 → 7,73%.
- Quiz s2: o terceiro fragmento começa em 2 × 1480 / 8 = 370.

Para o dono conferir:

- [x] CN 5.5.6 (fragmentação) e 5.7.1 (cabeçalho IPv4: DF, MF, deslocamento); RFC 791 e RFC 1191.
