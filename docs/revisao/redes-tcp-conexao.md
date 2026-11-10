# redes/tcp-conexao

Desvio da spec: o rascunho falava em 3 segmentos, mas a retransmissão rápida precisa de 3
ACKs duplicados, ou seja, de 3 segmentos **depois** do perdido. O tour envia 5.

- ISN da Lia = 2065858870 (semente fixa). Primeiro byte de dados = ISN + 1 = 2065858871.
- Segmentos de 1000 bytes: seq 2065858871, 2065859871 (perdido), 2065860871, 2065861871, 2065862871.
- O servidor confirma o 1: ACK 2065859871. Os segmentos 3, 4 e 5 geram 3 ACKs duplicados 2065859871.
- Retransmissão rápida no 3º duplicado (RFC 5681). Depois dela, ACK = 2065858871 + 5000 = 2065863871.
- FIN da Lia com seq 2065863871.

Tempos (RTT 40 ms, ida = 20 ms, envios espaçados de RTT/20 = 2 ms):
segmentos saem em 0, 2, 4, 6 e 8 ms; o 5º chega ao servidor em 28 ms e o 3º ACK duplicado
chega à Lia em 48 ms; a retransmissão chega ao servidor em 68 ms e o ACK final volta em
**88 ms**. Sem a retransmissão rápida, o timer (RTO = 2 × RTT = 80 ms) estouraria só em
2 + 80 = 82 ms, e a transferência terminaria depois de 120 ms.

Para o dono conferir:

- [x] a descrição do TIME_WAIT (2 × MSL) e do ACK cumulativo contra o Kurose & Ross (cap. 3).
