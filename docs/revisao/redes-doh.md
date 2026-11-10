# redes/doh

Mensagem DNS de saude.example A: 12 (cabeçalho) + 15 (nome: 1+5+1+7+1) + 4 (tipo e classe)
= 31 bytes, com ID 0 (RFC 8484 §4.1). O teste confere que o corpo do POST tem o mesmo tamanho da
pergunta em claro. O registro TLS mostra só o tamanho: cabeçalho de 5 bytes + dados + 1 + 16 (tag).

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
