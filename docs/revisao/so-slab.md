# Revisão: so/slab

Valor padrão: inode de 600 bytes, página de 4096 bytes.

## Buddy

- 600 arredonda para 1024; sobram 424 bytes por bloco: 424 / 1024 = 41%.
- Mil inodes: 1000 × 1024 = 1.024.000 bytes = 1000 KiB, para 600.000 bytes (586 KiB) de dados.

## Slab

- 4096 / 600 = 6,83: cabem 6 por placa, 3600 bytes; sobram 496: 496 / 4096 = 12%.
- Mil inodes: ⌈1000 / 6⌉ = 167 páginas = 668 KiB.

## Sequência

1. Aloca i1…i8: placa 1 = i1–i6 (cheia), placa 2 = i7, i8.
2. Libera as posições 1, 3, 4 da placa 1 (i2, i4, i5): pilha de livres da placa 1 = [1, 3, 4].
3. Aloca i9 e i10: placa parcial mais antiga = placa 1; a pilha entrega 4 e depois 3.
4. Libera i7 e i8: placa 2 vazia. Livres no cache: placa 1 tem 1 (posição 1), placa 2 tem 6 → 7.

## Para o dono conferir

- [x] A sequência acima bate com a grade da lição.
- [x] O texto do passo 1 com 512 bytes no Lab (potência de dois, sem sobra) faz sentido.
- [x] A menção ao SLUB e ao kmalloc está correta para o Linux atual.
