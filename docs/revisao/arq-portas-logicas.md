# arq/portas-logicas

A = 11 = 1011, B = 6 = 0110.

Tabela-verdade (A, B → AND, OR, XOR, NAND): 00 → 0 0 0 1; 01 → 0 1 1 1; 10 → 0 1 1 1; 11 → 1 1 0 0.

NAND universal: NOT A = A NAND A (1 porta); AND = NOT(A NAND B) (2); OR = (NOT A) NAND (NOT B) (3). Quiz: 3.

Meio-somador, bit 0: 1 + 0 → XOR 1, AND 0 (soma 1, vai-um 0).

Somador de 4 bits, do bit 0 para cima:

| coluna | A | B | Cin | soma | Cout |
|---|---|---|---|---|---|
| 0 | 1 | 0 | 0 | 1 | 0 |
| 1 | 1 | 1 | 0 | 0 | 1 |
| 2 | 0 | 1 | 1 | 0 | 1 |
| 3 | 1 | 0 | 1 | 0 | 1 |

Resultado 1 0001 = 17; em 4 bits, 0001 com vai-um 1.

Passo 4 usa a primeira coluna com vai-um de entrada (a 2): XOR 1 = 1, AND 1 = 0, soma = 1 XOR 1 = 0,
AND 2 = 1 AND 1 = 1, Cout = 0 OR 1 = 1. Quiz: 1.

Atrasos (toda porta = 1): XOR 1 e AND 1 ficam prontos em 1. Na coluna i, AND 2 fica pronto em max(1, Cin) + 1 e o OR
uma porta depois: vai-um em 3, 5, 7, 9. A soma da coluna 3 fica pronta em 7 + 1 = 8; tudo estável em 9 = 2·4 + 1.
Com 64 bits, 2·64 + 1 = 129.

Subtração: NOT 6 = 1001; 1011 + 1001 + 1 = 1 0101 → 0101 = 5 = 11 − 6. Tabela da ULA: A + B = 0001 (1 em 4 bits),
A − B = 0101, A AND B = 0010 (2), A OR B = 1111 (15).

O teste confere o somador completo nas 8 entradas, as 256 somas de 4 bits e o atraso de 64 bits.

Para o dono conferir:

- [x] SCO 3.1 e 3.2.3;
- [x] a convenção de atraso unitário por porta.
