# so/paginacao-multinivel

Tabela plana, 32 bits, páginas de 4 KiB: 32 − 12 = 20 bits de página → 2^20 entradas × 4 B = 4 MiB. Quiz: 4.

0x0A0123AB = 0000 1010 00 | 00 0001 0010 | 0011 1010 1011:

- diretório (bits 31–22): 0000101000 = 40;
- tabela (bits 21–12): 0000010010 = 18;
- deslocamento: 0x3AB.

Regiões (cada tabela de 2º nível cobre 2^22 = 4 MiB):

- código 0x08048000, 1 MiB: 0x08048000 >> 22 = 32 e 0x08147FFF >> 22 = 32 → 1 tabela;
- heap 0x0A000000, 8 MiB: entradas 40 e 41 → 2 tabelas;
- pilha 0xBFF00000, 1 MiB: 0xBFF00000 >> 22 = 767 = 0xBFFFFFFF >> 22 → 1 tabela;
- total com o diretório: 1 + 1 + 2 + 1 = 5 tabelas = 20 KiB. Quiz: 5.
- Laboratório heap 64 MiB: 16 tabelas → 19 (76 KiB).

x86-64, 0x7FFD12345678 = 011111111 | 111110100 | 010010001 | 101000101 | 011001111000:
PML4 255, PDPT 500, PD 145, PT 325, deslocamento 0x678. Tabelas: 512 × 8 B = 4 KiB.

Custo: falha na TLB = 4 tabelas + dado = 5 acessos. 98% de acertos, 100 ns:
0,98 × 100 + 0,02 × 500 = 98 + 10 = 108 ns. Quiz: 108. Dois níveis: 98 + 0,02 × 300 = 104 ns.

Páginas de 2 MiB: caminhada para no PD → 3 tabelas + dado = 4 acessos; deslocamento 21 bits.
Alcance da TLB com 64 entradas: 64 × 4 KiB = 256 KiB; 64 × 2 MiB = 128 MiB.

Para o dono conferir:

- [x] MOS 3.3.4; Maziero 14.7.3 (numeração da seção).
