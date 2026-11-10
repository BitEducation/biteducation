# so/paginacao-tlb

Endereço virtual de 16 bits, página de 4 KiB (VPN de 4 bits + offset de 12), 8 quadros,
TLB de 4 entradas com LRU, começando vazia. Páginas residentes: 0→2, 1→6, 2→0, 3→5, 4→1.
Quadros livres: 3, 4 e 7; o kernel usa o primeiro livre.

| # | Endereço | VPN | TLB | Observação |
|---|---|---|---|---|
| 1 | 0x3A7C | 3 | falha | PTE 3 → quadro 5; físico 0x5A7C |
| 2 | 0x3B00 | 3 | acerto | 0x5B00 |
| 3 | 0x7010 | 7 | falha | falta de página; quadro 3; físico 0x3010 (12304) |
| 4 | 0x7014 (escrita) | 7 | acerto | liga D e A da página 7 |
| 5 | 0x3A80 | 3 | acerto | |
| 6 | 0x0120 | 0 | falha | TLB: 3, 7, 0 |
| 7 | 0x1004 | 1 | falha | TLB cheia: 3, 7, 0, 1 |
| 8 | 0x3A84 | 3 | acerto | |
| 9 | 0x7018 | 7 | acerto | |
| 10 | 0x0124 | 0 | acerto | |

Acertos: 6 de 10 (60%). Faltas de página: 1.
Tempo efetivo (TLB 1 ns, memória 100 ns): acerto = 101 ns, falha = 201 ns;
0,6 × 101 + 0,4 × 201 = **141 ns**.

Para o dono conferir:

- [x] fórmula do tempo efetivo igual à do Silberschatz (cap. 9, "effective memory-access time");
- [x] layout dos bits de controle da PTE contra a especificação privilegiada (Sv32).
