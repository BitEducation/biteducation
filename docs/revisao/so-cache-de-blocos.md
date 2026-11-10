# so/cache-de-blocos

Cache de 12 blocos, LRU, antecipação de 4. N = notas.txt, V = video.mp4.

- Leitura N0–N7: falta em N0 traz N0–N3 (1 pedido); N1–N3 acertam; falta em N4 traz N4–N7;
  → 2 pedidos (sem antecipação: 8).
- Releitura N0–N3: 4 acertos, 0 pedidos.
- Escrita N2 × 3: acertos, bloco sujo, 0 gravações.
- V0–V11: faltas em V0, V4, V8 → 3 pedidos, 12 blocos; ao entrar, expulsam os 8 blocos de N
  (LRU); N2 sai sujo → 1 gravação. Ao final a cache tem V0–V11.
- Relê N2: falta, traz N2–N5 (expulsa V0–V3) → 1 pedido. Sync: nada sujo → 0.
- Total: 2 + 0 + 0 + 3 + 1 = 6 pedidos (quiz), 8 + 12 + 4 = 24 blocos lidos, 1 gravação.
- Sem antecipação: 8 + 0 + 12 + 1 = 21 pedidos.
- Quiz s4 (escolha): sem fsync(), a alteração estava só na cópia suja; nenhuma gravação foi ao disco nessa fase.

Para o dono conferir:

- [x] MOS 4.3.7 (VFS) e 4.4.4 (cache de blocos, leitura antecipada); Maziero 24.4 (gestão de blocos, figura 24.4).
