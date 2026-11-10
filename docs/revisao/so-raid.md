# so/raid

4 discos de 4 TB, 5 faixas. Valor do bloco i: (37·i + 0x5A) mod 256 → D0 5A, D1 7F, D2 A4, D3 C9, D4 EE, D5 13.

- RAID 0: 4 × 4 = 16 TB. Perda em um ano com AFR de 2%: 1 − 0,98⁴ = 1 − 0,9224 = 7,8%.
- RAID 1+0: 2 pares, 8 TB. Com 3 discos: 1 par, disco 3 de reserva, 4 de 12 TB.
- Paridade da faixa 0 (RAID 5, paridade no disco 4): 5A ⊕ 7F = 25; 25 ⊕ A4 = 81.
  Bits: 01011010 ⊕ 01111111 ⊕ 10100100 = 10000001.
- RAID 5: 3 × 4 = 12 TB. Paridade gira para a esquerda: faixas 0–3 nos discos 4, 3, 2, 1.
  Faixa 1: D3 no disco 4, D4 no 1, D5 no 2, P no 3 = C9 ⊕ EE ⊕ 13 = 34.
- Falha do disco 2: faixa 0 perde D1 = 5A ⊕ A4 ⊕ 81 = 7F (confere). 3 leituras por bloco.
  Reconstrução: 4·10¹² B / 200·10⁶ B/s = 20.000 s = 5,6 h.
- Escrita de D5 (faixa 1, disco 2, paridade no disco 3): 13 → 42.
  P nova = 34 ⊕ 13 ⊕ 42: 34 ⊕ 13 = 27; 27 ⊕ 42 = 65. Recalcular a faixa inteira (C9 ⊕ EE ⊕ 42) também dá 65.
  Acessos: RAID 0 1, RAID 1+0 2, RAID 5 4 (2 leituras + 2 gravações).

Laboratório:

- 3 discos: "1 par", "o outro bloco de dados"; quiz cita só D0 e P.
- 8 discos: perda em RAID 0 = 1 − 0,98⁸ = 14,9%; bloco 34 na última faixa.
- Entradas fora da faixa são limitadas (disco 9 → 5, bloco 99 → último).

Para o dono conferir:

- [x] Tanenbaum MOS 5.4.1 (RAID) e Maziero 21.2.
