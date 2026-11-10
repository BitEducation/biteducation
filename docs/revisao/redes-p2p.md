# redes/p2p

F = 1000 Mbit, servidor 100 Mbit/s, par envia 5 e recebe 20 Mbit/s.

- Cliente-servidor, N = 50: max(50 × 1000 / 100, 1000 / 20) = max(500, 50) = 500 s.
- P2P, N = 50: max(1000/100, 1000/20, 50 000 / (100 + 250)) = max(10, 50, 142,9) = 143 s.
- Peças (Lia tem a 1): 2 → 2 vizinhos, 3 → 1, 4 → 1, 5 → 3, 6 → 0. Mais rara com alguém: 3 (empate
  com 4, menor índice).
- Kademlia, chave 1011, início 0001 (contatos 0100, 1100): 0100⊕1011 = 1111 (15), 1100⊕1011 = 0111 (7)
  → pergunta 1100, que indica 1010, 1111, 0100. 1010⊕1011 = 0001 (1) → pergunta 1010, que indica
  1100, 1111: ninguém mais perto. 2 consultas.
- Quiz s2: 50 × 1000 / (100 + 50 × 5) = 50000 / 350 = 142,86 → 143 s.
- Laboratório: envio 1 → 50000 / 150 = 333 s; envio 20 → 50000 / 1100 = 45,5 s, limitado pelo download 1000 / 20 = 50 s.

Para o dono conferir:

- [x] CN 7.5.4 (BitTorrent e DHTs); fórmula do tempo de distribuição em fluxo contínuo.
