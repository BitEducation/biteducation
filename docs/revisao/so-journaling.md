# so/journaling

Append de 1 bloco ao arquivo do inode 12: bitmap (B), inode (I) e bloco de dados 300 (D).

Quedas parciais (6 combinações):

| No disco | Efeito | Estado |
| --- | --- | --- |
| B | 300 usado sem dono | vazamento |
| I | inode → 300 com conteúdo antigo; bitmap diz livre | corrompido |
| B + I | inode → 300 com conteúdo antigo | corrompido |
| D | dado sem referência, escrita perdida | coerente |
| B + D | 300 usado sem dono | vazamento |
| I + D | bitmap diz livre, bloco pode ir para outro arquivo | corrompido |

3 corrompem, 2 vazam, 1 coerente. Quiz: só o dado.

fsck, disco de 4 TB, um inode a cada 16 KiB: 4·10¹² / 16.384 = 244.140.625 inodes × 256 B = 62,5 GB.
A 200 MB/s: 62,5·10⁹ / 2·10⁸ = 312,5 s = 5,2 min.

Diário completo: TxB, I, B, D, TxE (5) + checkpoint I, B, D (3) = 8 escritas.
Queda após 3: sem TxE → descarta. Após 5 a 7: TxE presente → refaz. Após 8: limpo.

n blocos: sem diário n + 2; completo (n + 4) + (n + 2) = 2n + 6; ordenado n + 4 + 2 = n + 6.
n = 64: 66, 134, 70. n = 1: 3, 8, 7.

Para o dono conferir:

- [x] Tanenbaum MOS 4.3.6 e Maziero 24.7.2.
