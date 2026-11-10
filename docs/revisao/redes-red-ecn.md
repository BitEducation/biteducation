# redes/red-ecn

Fila: 2 4 6 8 10 12 14 15 15 15 15 14 12 10 8 6 4 3 3 3. w = 0,25; limiares 5 e 15; maxP = 0,4.

- Cauda (capacidade 15): chegadas 7, 8, 9, 10 → 4 descartes seguidos.
- Média: 0,5; 1,38; 2,53; 3,90; 5,42; 7,07; 8,80; 10,35; 11,51; 12,38; 13,04; 13,28; 12,96; 12,22; …
  máximo 13,28.
- p = 0,4 × (média − 5) / 10: 0,017; 0,083; 0,152; 0,214; 0,261; 0,295 → soma passa de 1 na
  chegada 9 (1,022). Depois: 0,022 + 0,322 + 0,331 + 0,318 + 0,289 = 1,28 → chegada 13.
- Média 10 → p = 0,4 × 5 / 10 = 0,2 = 20%.
- Quiz s3: 40% × (10 − 5) / (15 − 5) = 20%.
- Peso comparado 0,5: as marcas vão para as chegadas 8, 10 e 13 (simulador). Peso 0,1: só a chegada 15. Peso 0,05: a média não passa de 5,97 e nada é marcado.

Para o dono conferir:

- [x] CN 5.3.2 (RED e ECN); RFC 3168; marcação acumulada no lugar do sorteio (simplificação).
