# arq/instrucao-riscv

Codificações feitas campo a campo (RV32I):

| Instrução | Campos (alto → baixo) | Palavra |
|---|---|---|
| `add x5, x6, x7` | funct7 0000000 · rs2 00111 · rs1 00110 · funct3 000 · rd 00101 · opcode 0110011 | 0x007302B3 |
| `sub x5, x6, x7` | funct7 **0100000** · resto igual | 0x407302B3 |
| `addi x5, x5, -12` | imm 111111110100 · rs1 00101 · 000 · rd 00101 · 0010011 | 0xFF428293 |
| `sw x8, 20(x2)` | imm[11:5] 0000000 · rs2 01000 · rs1 00010 · 010 · imm[4:0] 10100 · 0100011 | 0x00812A23 |
| `beq x5, x0, +8` | imm[12] 0 · imm[10:5] 000000 · rs2 00000 · rs1 00101 · 000 · imm[4:1] 0100 · imm[11] 0 · 1100011 | 0x00028463 |

−12 com 12 bits: 12 = 000000001100; inverte = 111111110011; +1 = 111111110100.
Faixa do imediato I: −2048 a 2047. Desvios B: deslocamento par de −4096 a +4094.

Para o dono conferir:

- [x] tabela de opcodes contra o Patterson & Hennessy (edição RISC-V, cap. 2) e o manual da ISA.
