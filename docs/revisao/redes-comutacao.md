# redes/comutacao

1 Mbit = 1000 kbit; 10 Mbit/s = 10 kbit/ms → 100 ms por enlace. Três enlaces, sem propagação.

- Circuito: 30 (estabelecimento) + 100 = 130 ms.
- Mensagem inteira: 3 × 100 = 300 ms.
- 4 pacotes de 25 ms: (4 + 3 − 1) × 25 = 150 ms. 100 pacotes de 1 ms: (100 + 2) × 1 = 102 ms.
- 35 usuários, cada um ativo com p = 0,1; enlace comporta 10:
  P(X > 10) = Σ_{k=11..35} C(35,k) 0,1^k 0,9^(35−k) ≈ 0,000424 → 0,04%.
- Cabeçalho de 10 bits por pacote: o melhor número de pacotes é 14, último bit em 130,3 ms (varredura do simulador, função bestCount).
- Quiz s3: (4 + 3 − 1) × 25 = 150 ms.

Para o dono conferir:

- [x] CN 2.5.4 (comutação de circuitos e de pacotes) e 5.1.1 (armazena e encaminha).
- [x] Exemplo dos 35 usuários com p = 0,1: P(X > 10) ≈ 0,0004.
