# redes/websocket

Accept = Base64(SHA-1(chave + 258EAFA5-E914-47DA-95CA-C5AB0DC85B11)). O teste confere o
exemplo do RFC 6455 (dGhlIHNhbXBsZSBub25jZQ== → s3pPLMBiTxaQ9kYGzzhZRbK+xOo=), os vetores FIPS do
SHA-1 e que o quadro mascarado, desfeito com XOR, volta ao texto original. Fechamento com código 1000.

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
