# so/entrada-saida

Bloco de 4 KiB = 4096 bytes, palavras de 4 bytes: 1024 palavras. Uma palavra a cada 10 µs:
transferência de 1024 × 10 = 10240 µs = 10,24 ms. Interrupção custa 2 µs; preparar o DMA, 5 µs.

- Espera ocupada: CPU presa 10240 µs, 100%.
- Interrupção: 1024 × 2 = 2048 µs (quiz), 2048 ÷ 10240 = 20%.
- DMA: 5 + 2 = 7 µs, 7 ÷ 10240 = 0,068% → "0,1%".
- Linha do tempo (5 palavras, 50 µs): interrupção = P2 0–10, int 10–12, P2 12–20, int 20–22, ...;
  DMA = prepara 0–5, P2 5–50.
- Tabela: 1 µs por palavra → espera 100%, interrupção não acompanha (2 µs ≥ 1 µs), DMA 7 ÷ 1024 = 0,7%;
  100 µs → espera 100%, interrupção 2%, DMA 7 ÷ 102400 = 0,0068% → "0%".

Para o dono conferir:

- [x] MOS 5.1.4 e 5.2.2–5.2.4; Maziero 20.5.
