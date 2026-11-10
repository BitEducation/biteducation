# redes/streaming-cdn

Velocidade 8 Mbit/s, queda de 75% (para 2 Mbit/s) a partir do 6º segmento. Segmentos de 4 s; escada 0,5 / 1,5 / 3 / 6.

- Qualidade inicial: maior ≤ 0,8 × 8 = 6,4 → 6 Mbit/s; segmento de 24 Mbit.
- Partida (1º segmento em 1,5 Mbit/s = 6 Mbit → 0,75 s):
  origem 3 × 120 ms = 0,36 s (quiz) + 0,75 = 1,11 s; borda 3 × 10 ms = 0,03 + 0,75 = 0,78 s.
- Origem: 10 000 × 6 Mbit/s = 60 Gbit/s; com 95% na borda, 3 Gbit/s.
- Fixa em 6: segmentos 1–5 levam 3 s (buffer cresce 1 s por segmento: 4, 5, 6, 7, 8);
  do 6º em diante levam 24 ÷ 2 = 12 s → trava em cada um dos 7 restantes.
- Adaptativa: no 6º ainda pede 6 (mediu 8): leva 12 s com 8 s de buffer → 1 travada de 4 s.
  Depois mede 2 → 0,8 × 2 = 1,6 → 1,5 Mbit/s (quiz); 6 Mbit ÷ 2 = 3 s por segmento de 4 s, sem travar.

Para o dono conferir:

- [x] CN 7.4.3 e 7.5.3.
