# redes/quic

TCP + TLS 1.3 = 2 RTT = 80 ms contra 1 RTT = 40 ms no QUIC. Initial do cliente com 1200 bytes de
UDP (RFC 9000 §14.1); limite de amplificação 3 × 1200 = 3600 bytes; o servidor manda 2232.
Inteiros de tamanho variável conferidos com os exemplos do RFC 9000 §16 no teste.
Perda do pacote 2 (fluxo 4) não segura o fluxo 0; a retransmissão vai no pacote 4.

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
