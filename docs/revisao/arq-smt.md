# arq/smt

Threads A = i i m i i i m i e B = i i i i m i i i (m = falta). Falta: a thread volta a emitir
1 + 6 ciclos depois. Troca no grão grosso: 2 ciclos.

- Sem multithreading: A1 0, A2 1, A3 2 (falta, volta em 9), A4–A6 9–11, A7 12 (falta, volta em
  19), A8 19; B1–B4 20–23, B5 24 (falta, volta em 31), B6–B8 31–33 → 34 ciclos; 16 ÷ 34 = 47,1%.
- Grão grosso: A1–A3 0–2; ciclo 3 troca para B (pronto), espera até 5; B1–B5 5–9 (falta, volta
  em 16); ciclo 10 troca para A (pronta desde 9), espera até 12; A4–A7 12–15 (falta, volta em 22);
  ciclo 16 troca para B, B6–B8 18–20; ciclo 22 troca para A, A8 em 24 → 25 ciclos; 16 ÷ 25 = 64%.
- Grão fino (alterna): A1 0, B1 1, A2 2, B2 3, A3 4 (falta → 11), B3 5, B4 6, B5 7 (falta → 14),
  A4 11, A5 12, A6 13, B6 14, A7 15 (falta → 22), B7 16, B8 17, A8 22 → 23 ciclos; 69,6%.
- SMT (2 vias): A1+B1 0, B2+A2 1, A3+B3 2 (A → 9), B4 3, B5 4 (B → 11), A4 9, A5 10, B6+A6 11,
  A7+B7 12 (A → 19), B8 13, A8 19 → 20 ciclos; 16 ÷ 40 vias = 40%.
- Quiz s2 (escolha): a troca de grão grosso custa 2 ciclos; só compensa quando a falta, de 6, é bem maior.

Para o dono conferir:

- [x] SCO 8.1.2 (multithreading no chip).
