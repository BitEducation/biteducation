# Revisão: so/ssd

5 blocos × 4 páginas; L0–L11 gravados em sequência nos blocos 0, 1 e 2. Padrão: 2 reescritas, sem TRIM.

- Apagar o arquivo L4–L7: sem TRIM o bloco 1 continua "válido"; com TRIM, 4 inválidas.
- Reescrever L0, L1 → bloco 3, páginas 0 e 1; bloco 0 fica com 2 inválidas. Livres: só o bloco 4 (reserva).
- Coleta gulosa (bloco cheio com mais inválidas, exceto o aberto):
  - sem TRIM: bloco 0 (2 inválidas) → copia L2, L3 para o bloco 3 → 2 cópias.
  - com TRIM: bloco 1 (4 inválidas) → 0 cópias.
- Fator = (pedidas + cópias) ÷ pedidas: sem TRIM (2 + 2) ÷ 2 = 2; com TRIM 2 ÷ 2 = 1.
- Outras reescritas, sem TRIM: r = 1 → (1 + 3) ÷ 1 = 4; r = 3 → (3 + 1) ÷ 3 = 1,33.

## Para o dono conferir

- [x] A faixa de ciclos de apagamento ("centenas a dezenas de milhares") está adequada.
- [x] A coleta escolhendo a vítima de forma gulosa é uma simplificação aceitável.
