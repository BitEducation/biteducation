# redes/smtp

MX 10 mx.pesquisa.example (203.0.113.25), porta 25, servidor fala primeiro (220). EHLO anuncia
SIZE, 8BITMIME, STARTTLS. Envelope (MAIL FROM/RCPT TO) separado dos cabeçalhos; nada no SMTP prova o
remetente (quiz: SPF, DKIM, DMARC). DATA termina em CRLF.CRLF → 250. Corpo de 200 bytes; 13 mensagens.
Laboratório: com outro remetente o servidor aceita do mesmo jeito; o texto aponta SPF, DKIM e DMARC.

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
