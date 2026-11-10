# so/inodes

Arquivo de 200 KiB, blocos de 4 KiB: 200 / 4 = 50 blocos de dados.

- 12 diretos (blocos lógicos 0 a 11, até 48 KiB);
- 38 pelo indireto simples, que cabe num único bloco de índice (1024 ponteiros de 4 bytes): 1 bloco de índice.

Deslocamento 100 KiB: 100 / 4 = 25 → bloco lógico 25; 25 − 12 = 13 → indireto simples, posição 13. Quiz: 25.

Caminho /home/ana/notas.txt sem cache: para /, /home e /home/ana, ler o inode e o bloco do diretório
(3 × 2 = 6), mais o inode 57: 7 leituras. Quiz: 7.

Tamanho máximo:

- 4 KiB: (12 + 1024 + 1024² + 1024³) × 4 KiB = 1 074 791 436 × 4 KiB ≈ 4 TiB;
- 1 KiB: (12 + 256 + 256² + 256³) = 16 843 020 blocos × 1 KiB ≈ 16,1 GiB.

Laboratório, 100 000 KiB com blocos de 1 KiB: 12 + 256 + 65 536 + 34 196. Índices: 1 (simples) + 1 + 256 (duplo)
+ 1 + 1 + 134 (triplo) = 394.

Links: ln eleva o contador do inode 57 a 2; rm notas.txt volta a 1 e os dados ficam.

Para o dono conferir:

- [x] MOS 4.3.2 e 4.3.3; Maziero 24.5.5.
