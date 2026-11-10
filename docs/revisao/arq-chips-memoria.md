# arq/chips-memoria

16 MiB = 128 Mbit; barramento de 32 bits; chip de 4 Mbit.

- 512K × 8: 19 bits de endereço (2^19 = 512K), linha 10 + coluna 9, 10 pinos; 32 ÷ 8 = 4 chips
  por banco; banco = 512K × 4 bytes = 2 MiB; 16 ÷ 2 = 8 bancos (3 bits); 4 × 8 = 32 chips (quiz).
- 1M × 4: 20 bits, 10 pinos, 8 por banco, banco de 4 MiB, 4 bancos → 32 chips.
- 4M × 1: 22 bits, 11 pinos, 32 por banco, 1 banco de 16 MiB → 32 chips.
- Endereço 0xA35F26 (24 bits): byte = 0b10 = 2; palavra = 0xA35F26 >> 2 = 0x28D7C9;
  coluna = 0x28D7C9 & 0x1FF = 0x1C9 = 457; 0x28D7C9 >> 9 = 5227; linha = 5227 & 0x3FF = 107;
  banco = 5227 >> 10 = 5.
- Quiz s2: 32 / 8 = 4 chips por banco.

Para o dono conferir:

- [x] SCO 3.3.5 (chips de memória) e 3.3.6 (RAMs e ROMs).
