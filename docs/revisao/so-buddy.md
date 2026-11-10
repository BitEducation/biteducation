# so/buddy

Memória de 1024 KiB, menor bloco 64 KiB. Endereços em KiB; irmão = endereço XOR tamanho.

- A 100 → 128. 1024 → 512+512 → 256+256 → 128+128: 3 divisões. A em 0. Livres: 128@128, 256@256, 512@512.
- B 240 → 256: lista de 256 tem 256@256, sem divisão.
- C 60 → 64: menor livre é 128@128 → 64@128 + 64@192 (1 divisão). C em 128.
- D 250 → 256: só há 512@512 → 256@512 + 256@768 (1 divisão). D em 512. Total: 5 divisões.
- Interna: (128−100) + (256−240) + (64−60) + (256−250) = 28 + 16 + 4 + 6 = 54 KiB; pedidos 650, alocado 704.
  Quiz: 129 → 256.
- Libera B (256@256): irmão 0@256 está ocupado por A e C → sem fusão.
- Libera A (128@0): irmão 128@128 tem C → sem fusão. E 120 → 128@0.
- Livres: 64@192, 256@256, 256@768 = 576 KiB; maior 256. F 400 → precisa de 512 → falha (fragmentação externa).
- Libera C: 64@128 + 64@192 → 128@128 (1). Libera E: 128@0 + 128@128 → 256@0 (2); + 256@256 → 512@0 (3).
  Libera D: 256@512 + 256@768 → 512@512 (4); + 512@0 → 1024 (5). Total: 5 fusões.

Laboratório:

- F ≤ 256: cabe; o texto sugere a faixa que falha por fragmentação (257 a 512).
- F > 512 com 576 livres: falta memória de verdade; o texto separa esse caso da fragmentação.
- A = 256: 2 divisões; liberar A funde uma vez; o maior bloco livre na hora de F é 512.

Para o dono conferir:

- [x] Maziero 16.3 (fragmentação) e 16.4 (alocador Buddy).
