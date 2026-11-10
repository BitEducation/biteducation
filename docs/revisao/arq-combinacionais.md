# arq/combinacionais

Seleção 5 = 101, dados 178 = 1011 0010, deslocamento 3 = 011.

- Decodificador 3 → 8: só a saída 5 vale 1; ela é AND(C2, NOT C1, C0). Portas: 3 NOT + 8 AND = 11.
- Multiplexador: D5 = bit 5 de 178 = (178 >> 5) & 1 = 5 & 1 = 1 (quiz: D5). Portas: 11 + 8 AND +
  1 OR = 20.
- Deslocador: estágio 1 (bit 0 = 1): 1011 0010 << 1 = 0110 0100 (100); estágio 2 (bit 1 = 1):
  << 2 = 1001 0000 (144); estágio 4 (bit 2 = 0): fica 1001 0000. Confere: 178 × 8 = 1424,
  1424 mod 256 = 144.
- Portas do deslocador: 3 estágios × (8 muxes × 3 portas + 1 NOT) = 75; 24 multiplexadores.
- Quiz s3: 178 × 8 = 1424; 1424 mod 256 = 144 = 10010000.

Para o dono conferir:

- [x] SCO 3.2.2 (multiplexadores, decodificadores) e 3.2.3 (deslocadores).
