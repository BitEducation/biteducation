# redes/crc

Dados 859 = 1101011011, gerador 10011 (x⁴ + x + 1). Dividendo 11010110110000.

| XOR na coluna | Bits depois |
| --- | --- |
| 1 | 01001110110000 |
| 2 | 00000010110000 |
| 7 | 00000000101000 |
| 9 | 00000000001110 |

Resto 1110 (quiz); quadro 11010110111110. O receptor divide e obtém 0000.

Bit 5 invertido: 11011110111110; resto diferente de zero (o teste confere que todo bit isolado é pego).

Erro invisível: bits 9, 12 e 13 (o gerador 10011 deslocado uma casa para a esquerda do fim):
11010110111110 vira 11010110011000, que dividido dá resto 0000 e é aceito.

CRC-32 (IEEE 802.3): distância de Hamming 4 até 91 607 bits, então 1, 2 e 3 bits sempre; rajadas ≤ 32 sempre.

Para o dono conferir:

- [x] CN 3.2.2 (o exemplo 1101011011 ÷ 10011 = resto 1110 é o mesmo do livro).
