# redes/rtp

Trânsito (ms): 40 48 42 61 45 44 70 47 43 52. 8 kHz, 20 ms → timestamp +160.

- J (RFC 3550, J += (|D| − J)/16): 0; 0,5; 0,84; 1,98; 2,85; 2,74; 4,19; 5,37; 5,28; 5,52.
  Ex.: pacote 2: (8 − 0)/16 = 0,5. Pacote 3: 0,5 + (6 − 0,5)/16 = 0,84.
- Espera de 50 ms: atrasados 61, 70, 52 → pacotes 4, 7, 10. Espera de 75 ms: nenhum.
- Quiz s1: 8000 × 20 / 1000 = 160 por pacote; o terceiro tem 2 × 160 = 320.
- Quiz s4: trânsitos acima de 50 ms: 61, 70 e 52 (pacotes 4, 7 e 10) → 3.
- Laboratório: espera 45 → pacotes 2, 4, 7, 8, 10; espera 70 → nenhum (o maior trânsito é 70, não passa de 70).

Para o dono conferir:

- [x] CN 6.4.3 (RTP e RTCP); RFC 3550 6.4.1 e limite de 5% do RTCP.
