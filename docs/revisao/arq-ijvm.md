# arq/ijvm

Programa: soma = 0; while (i != 0) { soma += i; i--; } return soma; i no local 0, soma no local 1. Padrão i = 5.

Montagem (bytes): BIPUSH 0 (10 00), ISTORE 1 (36 01), ILOAD 0 (15 00), IFEQ fim (99 00 10), ILOAD 1, ILOAD 0, IADD (60),
ISTORE 1, IINC 0 -1 (84 00 FF), GOTO laco (A7 FF F1), ILOAD 1, IRETURN (AC): 2+2+2+3+2+2+1+2+3+3+2+1 = 25 bytes.
IFEQ em 0x06 salta +16 para 0x16; GOTO em 0x13 volta 15 bytes para 0x04.

Instruções executadas: 2 antes + 8 por volta + 4 na saída (ILOAD, IFEQ desvia, ILOAD, IRETURN) = 8n + 6 = 46; soma = 15.

Ciclos (modelo próprio estilo Mic-1, 1 ciclo Main1 + microinstruções):

| Instrução | Ciclos | Com busca antecipada |
| --- | --- | --- |
| BIPUSH | 4 | 2 |
| ILOAD | 6 | 5 |
| ISTORE | 7 | 5 |
| IADD | 4 | 3 |
| IINC | 7 | 4 |
| IFEQ segue / desvia | 8 / 11 | 4 / 7 |
| GOTO | 7 | 3 |
| IRETURN | 9 | 7 |

- Volta (quiz): 6 + 8 + 6 + 6 + 4 + 7 + 7 + 7 = 51. Antes: 4 + 7 = 11. Saída: 6 + 11 + 6 + 9 = 32. Total = 43 + 51n = 298.
- CPI = 298 / 46 = 6,48.
- Busca antecipada: volta 5 + 4 + 5 + 5 + 3 + 5 + 4 + 3 = 34; antes 7; saída 24; total 31 + 34n = 201; ganho 298/201 = 1,48.
- Extremos: n = 0 → 6 instruções, 43 ciclos; n = 10 → 86 instruções, soma 55.

Para o dono conferir:

- [x] Tanenbaum SCO 4.2 (IJVM), 4.3 (microprograma Mic-1), 4.4 (unidade de busca). As microinstruções são modelo próprio.
