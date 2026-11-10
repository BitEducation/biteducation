# so/leitores-escritores

Cenário padrão: L1..L5 chegam em 0, 2, 4, 6, 8 e leem 4 ticks; E1 chega em 1 e E2 em 7, escrevendo 2 ticks.
Regra do tick: quem termina sai antes de alguém entrar; chegadas do tick entram na fila antes da admissão.

Mutex único (ordem de chegada): L1 0–4, E1 4–6, L2 6–10, L3 10–14, L4 14–18, E2 18–20, L5 20–24.
Total 24 = 5 × 4 + 2 × 2, sem ociosidade. Quiz: 24. Maior espera: L5, 20 − 8 = 12.

Leitores primeiro: um leitor entra sempre que não há escritor ativo.
L1 0–4, L2 2–6, L3 4–8, L4 6–10, L5 8–12; a leitura nunca para até 12. E1 12–14, E2 14–16.
Total 16; no máximo 2 lendo juntos. Espera de E1: 12 − 1 = 11. Quiz: 11.

Escritores primeiro: leitor novo não entra se há escritor ativo ou esperando.
L1 0–4; E1 espera desde 1 e barra L2 (2) e L3 (4). Em 4, E1 4–6. Em 6, sem escritor na fila (E2 chega em 7):
L2, L3 e L4 leem 6–10. E2 chega em 7 e barra L5 (8). E2 10–12, L5 12–16.
Total 16; 3 lendo juntos. Esperas: E1 3, L2 4, L3 2, E2 3, L5 4. Maior: L2 (empata com L5), 4.

Fila justa (ordem de chegada, leitores consecutivos no início entram juntos): mesmo resultado neste cenário.

Laboratório:

- 2 leitores, leitura 2: L1 termina em 2, quando E1 já espera; E1 entra em 2 (espera 1) nas três políticas.
- 6 leitores, leitura 6: mutex 40 = 6 × 6 + 4; leitores primeiro 20, com E1 esperando 15.

Para o dono conferir:

- [x] MOS 2.5.2; Maziero 12.2.
