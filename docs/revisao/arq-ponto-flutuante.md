# arq/ponto-flutuante

Valor padrão: −6,375.

6 = 110 e 0,375 = 0,25 + 0,125 = 0,011, logo 6,375 = 110,011₂ = 1,10011 × 2².

- Sinal: 1 (negativo).
- Expoente: 2 + 127 = 129 = 1000 0001. Quiz do passo 2: 129.
- Fração: 10011 seguido de 18 zeros.
- Padrão: 1 | 1000 0001 | 1001 1000 … 0 → 1100 0000 1100 1100 0000 … = 0xC0CC0000. Exato.

0,1 = 0,000110011…₂ = 1,1001 1001 1001 … × 2⁻⁴.

- Expoente: −4 + 127 = 123 = 0111 1011.
- Fração: os 23 primeiros bits são 1001 1001 1001 1001 1001 100 e os seguintes 1100…, mais da metade, então arredonda
  para cima: …1001 101.
- Padrão: 0 | 0111 1011 | 1001 1001 1001 1001 1001 101 = 0x3DCCCCCD.
- Valor: 13 421 773 × 2⁻²⁷ = 0,100000001490116…; erro ≈ 1,49 × 10⁻⁹.
- Em precisão dupla, 0,1 + 0,2 = 0,30000000000000004.

Distância ao vizinho (24 bits de precisão, ulp = 2^(e − 23)):

- perto de 1, e = 0: 2⁻²³ ≈ 1,19 × 10⁻⁷;
- perto de 1000, e = 9: 2⁻¹⁴ ≈ 6,1 × 10⁻⁵;
- perto de 2²⁴ = 16 777 216, e = 24: 2.

Quiz do passo 5: 16 777 217 fica no meio de 16 777 216 e 16 777 218. No empate vence a fração par (a de 2²⁴, toda
zerada): 16 777 216.

Especiais: +0 = 0x00000000, −0 = 0x80000000, 2⁻¹⁴⁹ = 0x00000001, +∞ = 0x7F800000 e NaN silencioso canônico =
0x7FC00000.

O teste confere os padrões conhecidos e a varredura do Laboratório (0,1; 1; 99 999 999; 10⁻⁸; 0 cai no padrão).

Para o dono conferir:

- [x] SCO apêndice B (B.1, B.2).
