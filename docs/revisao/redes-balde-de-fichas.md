# redes/balde-de-fichas

Chegadas: 20 pacotes em 0 ms, 10 em 10 ms, 6 em 20 ms (36). Linha: 10 por ms. Fichas: 2 por ms, balde 8 (começa cheio).

- Sem controle: 10, 10 nos ms 0 e 1; pico 10, atraso 1 ms.
- Balde furado (2 por ms): os 20 saem de 0 a 9 → o último espera 9 ms.
- Balde de fichas: ms 0 sai min(20, 8, 10) = 8 (quiz), fila 12, fichas 0. Depois 2 por ms: fila zera no ms 6
  → maior atraso 6 ms. Fichas acumulam 2, 4, 6, 8 até o ms 10: saem 8 dos 10, fila 2, que sai no ms 11.
  No ms 20, saem os 6. Fila máxima 12.
- Rajada a toda com balde cheio: 8 ÷ (10 − 2) = 1 ms.
- Policiamento: ms 0 passam 8 e caem 12; ms 10 passam 8 e caem 2; ms 20 passam 6. Descartados 14.

Para o dono conferir:

- [x] CN 5.3.2 (modelagem de tráfego).
