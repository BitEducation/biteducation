# so/segmentacao

Memória física de 16 KiB (células de 1 KiB). SO em 0–1. Processo A:

| Seg. | Nome | Base | Limite | Perm. |
| --- | --- | --- | --- | --- |
| 0 | código | 4096 | 3072 | r-x |
| 1 | dados | 9216 | 2048 | rw- |
| 2 | pilha | 13312 | 1024 | rw- |

- (1, 500): 500 < 2048, físico 9216 + 500 = 9716 (quiz).
- (1, 2100): 2100 ≥ 2048, falha de limite. (0, 100) escrita: dentro, mas r-x, falha de proteção.
- B compartilha o código (base 4096). Dados de B, 2 KiB, primeiro buraco: células 2–3, base 2048.
- Buracos: 7–8, 11–12, 14–15: 6 KiB livres (quiz), maior 2 KiB; pilha de 3 KiB não cabe.
- Compactação (SO, código e dados de B ficam): dados de A 9–10 → 7–8 (base 7168), pilha de A 13 → 9
  (base 9216); 3 KiB copiados. Livre 10–15 (6 KiB); pilha de B em 10240 (10–12). Sobram 3 KiB.

Extremo (2, 4095): 4095 ≥ 1024, falha; o passo 2 fica sem quiz e explica a falha.

Para o dono conferir:

- [x] MOS 3.7; Maziero 14.6.
