# arq/ordem-dos-bytes

0x0A0B0C0D: mais significativo 0A, menos significativo 0D.

- Little-endian a partir de 0x100: 0D 0C 0B 0A. Byte em 0x100 = 0x0D = 13. Quiz: 13.
- Big-endian: 0A 0B 0C 0D.

Porta 443 = 0x01BB → na rede (big-endian): 01 BB. Lido como little-endian: 0xBB01 = 187 × 256 + 1 = 47873.
Quiz: 47873. Laboratório porta 257 = 0x0101: bytes iguais, o erro não aparece (texto trata o caso).

Alinhamento, palavras de 4 bytes: inteiro em 0x102 ocupa 0x102–0x105 → palavras 0x100 e 0x104 → 2 acessos.
Em 0x104 ou 0x10C: 1 acesso.

struct { char a; int b; char c; short d; }:

- a @0 (1); b precisa de múltiplo de 4 → @4 (3 de preenchimento); c @8; d precisa de par → @10 (1 de preenchimento);
- fim em 12; alinhamento máximo 4 → sizeof 12. Dados 8, preenchimento 4. Quiz: 12.
- Maiores primeiro: b @0, d @4, a @6, c @7 → 8 bytes, sem preenchimento. 1000 structs: 12000 → 8000, economia 4000.

Para o dono conferir:

- [x] Tanenbaum SCO 2.2.2 e 2.2.3.
