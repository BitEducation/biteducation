# arq/niveis

x = a + b com a em 0(a0), b em 4(a0), x em 8(a0).

- lw t0, 0(a0): imm 0 | rs1 01010 | 010 | rd 00101 | 0000011 = 0x00052283.
- lw t1, 4(a0): imm 000000000100 | 01010 | 010 | 00110 | 0000011 = 0x00452303.
- add t2, t0, t1: 0000000 | 00110 | 00101 | 000 | 00111 | 0110011 = 0x006283B3.
- sw t2, 8(a0): 0000000 | 00111 | 01010 | 010 | 01000 | 0100011 = 0x00752423.
- 4 × 32 = 128 bits.
- Multiciclo: lw 5 passos (quiz), add 4, sw 4 → 5 + 5 + 4 + 4 = 18 ciclos.
- Somador de 32 bits: 32 somadores completos × (2 XOR + 2 AND + 1 OR) = 160 portas.
- Quiz s3 (escolha): chamadas ao sistema são interpretadas pelo SO, não executadas pela ISA.

Para o dono conferir:

- [x] SCO 1.1 (máquinas multinível, seis níveis).
