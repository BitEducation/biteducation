# Revisão: redes/celular

- Reúso: 420 canais, 84 células. N = 7 → 60 por célula → 60 × 84 = 5.040. N = 4 → 105 → 8.820. N = 3 → 140 → 11.760.
- Sinal: A = 50 − 2,2x + oscilação, B = 50 − 2,2(20 − x) + oscilação (oscilações fixas, sementes 11 e 29, de −3 a +3 dB).
- Posições 10–12: A 27,9 / B 28,9; A 27,9 / B 27,2; A 23,1 / B 33,1.
  - Histerese 0: troca em 10 (B > A), volta em 11 (A > B), troca de novo em 12 → 3 trocas.
  - Histerese 3 (padrão): em 10, 28,9 < 27,9 + 3; em 12, 33,1 > 23,1 + 3 → 1 troca, na posição 12.

## Para o dono conferir

- [x] MME/AMF e gateway/UPF; autenticação mútua desde o 3G.
