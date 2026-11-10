# arq/pilha-chamadas

fact(4), molduras de 16 bytes, sp inicial 0x8000; main em 0x100 (`jal ra, fact` em 0x104), fact em 0x200.

- jal no main grava ra = 0x104 + 4 = 0x108 e salta para 0x200.
- Instrução após o jal interno: 0x200 + 7 × 4 = 0x21C (sétima palavra de fact, contando de 0).
- Prólogo de fact(4): sp = 0x8000 − 16 = 0x7FF0; guarda ra = 0x108 em sp+12 e n = 4 em sp+8.
- fact(3), fact(2), fact(1): sp 0x7FE0, 0x7FD0, 0x7FC0, todas com ra = 0x21C. 3 chamadas internas.
- Ponto mais fundo: 4 molduras × 16 = 64 bytes. Quiz: 64.
- Retornos: fact(1) = 1 → fact(2) = 2 → fact(3) = 6 → fact(4) = 24. Três ret vão para 0x21C, o último para 0x108.
  sp volta a 0x8000.
- Pilha de 8 MiB: 8 × 1024 × 1024 / 16 = 524.288 níveis.

Laboratório:

- n = 1: só o caso base, 1 moldura, 16 bytes, sp 0x7FF0; texto do passo 4 trata o caso.
- n = 2: 1 chamada interna (singular tratado).
- n = 12: 12! = 479.001.600 (cabe em 32 bits; 13! = 6.227.020.800 não cabe), 192 bytes, sp mais baixo 0x7F40.
- Pilha de 1 KiB: 64 níveis; fact(12) usaria 12/64 = 18,75%.

Para o dono conferir:

- [x] Tanenbaum SCO 5.6.2, 4.2.1 e 5.4.8.
