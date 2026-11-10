# redes/imap

Porta 143 (993 com TLS), comandos com etiquetas a1, a2…; SELECT devolve 1 EXISTS, UIDVALIDITY e
UID 101. FETCH de FLAGS e 2 cabeçalhos antes do corpo; BODY[TEXT] marca \Seen no servidor.
O celular em IDLE recebe `* 1 FETCH (FLAGS (\Seen))` sem perguntar (quiz).

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
