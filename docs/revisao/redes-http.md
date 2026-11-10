# redes/http

Pedido GET /horarios com 137 bytes; resposta 200 com corpo de 99 bytes e
Cache-Control max-age=60. Segundo pedido na mesma conexão: 404, nenhum handshake novo.
Revalidação com If-None-Match → 304 sem corpo (99 bytes economizados). Content-Length conferido
contra o corpo no teste; quiz: erro do servidor → 5xx.

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
