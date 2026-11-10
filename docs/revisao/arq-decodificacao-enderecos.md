# arq/decodificacao-enderecos

EPROM 2 KiB em 0x0000, RAM 2 KiB em 0x8000, E/S de 4 bytes em 0xFFFC; endereço de 16 bits.

- Completa: EPROM e RAM usam 11 bits próprios → comparam 16 − 11 = 5; E/S usa 2 → compara 14.
- Parcial: EPROM se A15 = 0; RAM se A15 A14 = 10; E/S se 11.
  Cópias: EPROM 32 KiB ÷ 2 KiB = 16 (quiz); RAM 16 KiB ÷ 2 KiB = 8; E/S 16 KiB ÷ 4 = 4096.
- Acessos: 0x0010 EPROM nas duas; 0x0810 ninguém / EPROM pos. 16; 0x8004 RAM pos. 4 nas duas;
  0x9004 ninguém / RAM pos. 0x9004 & 0x7FF = 4; 0xFFFD E/S pos. 1; 0xC001 ninguém / E/S pos. 1.
  Fantasmas: 0x0810, 0x9004, 0xC001 → 3.
- Quiz s4: A15 A14 = 10 cobre 16 KiB; a RAM tem 2 KiB → 8 cópias (3 bits não olhados, 2³).

Para o dono conferir:

- [x] SCO 3.7.2 (decodificação de endereço).
