# arq/inteiros

A = 77 = 64 + 8 + 4 + 1 = 0100 1101 = 0x4D.

−77: inverte → 1011 0010; soma 1 → 1011 0011 = 0xB3. Sem sinal: 179. Com sinal: −128 + 32 + 16 + 2 + 1
= −128 + 51 = −77.

Passo 4, 100 + (−77): 0110 0100 + 1011 0011 = 1 0001 0111 → descarta o vai-um → 0001 0111 = 23.
Vai-um para o bit 7 = 1 e saída = 1: V = 0.

Passo 5, 77 + 100: 0100 1101 + 0110 0100 = 1011 0001 = 177 sem sinal = 177 − 256 = −79 com sinal.
Vai-um para o bit 7 = 1, saída = 0: V = 1 (overflow). Quiz: −79.

Passo 6: −77 em 16 bits = 0xFFB3; com zeros, 0x00B3 = 179.

O teste confere o sinalizador V contra a soma verdadeira numa varredura de −128 a 127.

Para o dono conferir:

- [x] SCO apêndice A (A.2, A.4, A.5);
- [x] a convenção do sinalizador C na subtração usada em aula.
