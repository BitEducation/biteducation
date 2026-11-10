# redes/proxies

15 pedidos (semente 11, popularidade 1/k entre 8 objetos): 2 2 3 3 6 2 1 2 3 2 2 6 2 3 4.
Rede local 5 ms; origem 80 ms; objeto 50 KB; 304 = 0,3 KB.

Cache LRU de 4 objetos, validade longa:

- falta 2, acerto 2, falta 3, acerto 3, falta 6, acerto 2, falta 1 (cheia: 2, 3, 6, 1), acertos 2, 3, 2, 2, 6, 2, 3,
  falta 4 (sai o 1). 10 acertos, 5 faltas.
- Tempo médio (quiz): (10 × 5 + 5 × 85) / 15 = 475 / 15 = 31,7 ms. Sem proxy: 85 ms.
- Da origem: 5 × 50 = 250 KB (sem proxy 750).

max-age = 5 s: 5 acertos viram revalidações (cópias com 5 s ou mais) → 250 + 5 × 0,3 = 251,5 KB.

Balanceamento, 3 servidores, um pedido por tick, durações 1,1,1,1,9 repetidas, um pedido por vez em cada servidor:

- Revezamento: os relatórios (pedidos 5, 10, 15) caem em S2, S1 e S3 e seguram os pedidos seguintes da fila: média 3,8.
- Menos conexões: média 2,6.

Para o dono conferir:

- [x] Tanenbaum CN 7.5.2; RFC 9111 (cache HTTP, Cache-Control, revalidação).
