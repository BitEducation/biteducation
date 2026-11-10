# redes/camada-fisica

Banda 3 kHz, S/N 30 dB, 2 bits por símbolo (4 níveis).

- Nyquist: 2 × 3000 = 6000 símbolos/s × log₂ 4 = 2 → 12 000 bit/s = 12 kbit/s (quiz).
- Tabela: 1 bit → 6 kbit/s; 2 → 12; 3 → 18; 4 → 24; 6 → 36 kbit/s.
- S/N: 30 dB = 10³ = 1000. Shannon: 3000 × log₂ 1001 = 3000 × 9,967 = 29 902 → 29,9 kbit/s.
  Só 6 bits (36 kbit/s) passa do limite. Níveis úteis: √1001 = 31,6 → "32".
- Bits 10110000. NRZ: o maior trecho sem mudança são os 4 zeros finais (4 bits).
  NRZI (começa baixo): 1 sobe, 0 fica, 1 desce, 1 sobe, 0000 ficam altos.
  Manchester: 1 = baixo-alto, 0 = alto-baixo; entre bits iguais há transição no meio, então nunca
  passa de 1 tempo de bit sem mudar. Com 3 kHz, Manchester daria 3 kbit/s.
- 4B/5B: 1011 → 10111, 0000 → 11110. Maior sequência de zeros: 4 → 0 (os códigos têm no máximo
  1 zero inicial e 2 finais; emendados, até 3).

Para o dono conferir:

- [x] CN 2.1 e 2.4.
