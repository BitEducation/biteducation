# so/alocacao-particoes

32 blocos de 8 KiB. A 5, B 3, C 6, D 2, E 4, F 3 → posições 0, 5, 8, 14, 16, 20.
Saem B, D, F → buracos 5–7 (3), 14–15 (2), 20–31 (12): 17 blocos = 136 KiB.
Depois: G 2, H 3, I 9, J 8.

- Primeiro: G em 5 (sobra 7); H: buracos 7 (1), 14–15 (2), 20–31 → 20; I: 23–31 (9) → 23;
  J: buracos 7 (1) e 14–15 (2) → falha. Fim: 2 buracos, 3 blocos (24 KiB), maior 2 (16 KiB).
- Próximo: cursor no fim de F (23), dentro do buraco 20–31 → G em 20; H em 22; I: buracos
  3, 2 e 25–31 (7) → falha; J falha. Fim: 12 blocos livres, maior 7.
- Melhor: G no buraco de 2 (14); H no de 3 (5); I em 20; J: resta 29–31 (3) → falha.
  Fim: 1 buraco, 3 blocos.
- Pior: G no maior (20); H no maior (22–31) → 22; I: maior = 25–31 (7) → falha; J falha.
  Fim: 3 + 2 + 7 = 12 blocos = 96 KiB, maior 7 = 56 KiB (quiz).
- Quiz s4: buracos de 3, 2 e 12 blocos; o menor que serve para 3 blocos é o de 3.

Para o dono conferir:

- [x] MOS 3.2.3 (algoritmos de alocação) e Maziero 16.3.1 (estratégias de alocação).
