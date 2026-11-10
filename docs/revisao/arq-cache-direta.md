# arq/cache-direta

Cache de mapeamento direto: 8 linhas × 16 bytes, endereços de 16 bits.
Deslocamento = 4 bits, índice = 3 bits, tag = 9 bits. Índice = (endereço ÷ 16) mod 8.

| # | Endereço | Bloco | Linha | Tag | Resultado |
|---|---|---|---|---|---|
| 1 | 0x1A04 | 0x1A0 | 0 | 0x034 | falta compulsória |
| 2 | 0x1A08 | 0x1A0 | 0 | 0x034 | acerto |
| 3 | 0x1A1C | 0x1A1 | 1 | 0x034 | falta compulsória |
| 4 | 0x1A0C | 0x1A0 | 0 | 0x034 | acerto |
| 5 | 0x2A00 | 0x2A0 | 0 | 0x054 | falta compulsória (expulsa 0x034) |
| 6 | 0x1A04 | 0x1A0 | 0 | 0x034 | falta de conflito |
| 7 | 0x2A04 | 0x2A0 | 0 | 0x054 | falta de conflito |
| 8 | 0x1A14 | 0x1A1 | 1 | 0x034 | acerto |
| 9 | 0x3020 | 0x302 | 2 | 0x060 | falta compulsória |
| 10 | 0x3024 | 0x302 | 2 | 0x060 | acerto |
| 11 | 0x1A00 | 0x1A0 | 0 | 0x034 | falta de conflito |
| 12 | 0x1A1F | 0x1A1 | 1 | 0x034 | acerto |

Acertos 5, faltas 7 (4 compulsórias, 3 de conflito, 0 de capacidade: uma cache totalmente
associativa LRU de 8 blocos acertaria as leituras 6, 7 e 11). Depois da leitura 7, 6 das 8
linhas continuam vazias.

AMAT = 1 + 7/12 × 100 ≈ **59,3 ns**.

Com 2 vias (4 conjuntos, conjunto = bloco mod 4): 0x1A0 e 0x2A0 caem no conjunto 0 e
convivem; só as 4 compulsórias faltam. 8 acertos, AMAT = 1 + 4/12 × 100 ≈ **34,3 ns**.

Para o dono conferir:

- [x] a classificação dos 3 C's no Patterson & Hennessy (cap. 5) e no Stallings.
