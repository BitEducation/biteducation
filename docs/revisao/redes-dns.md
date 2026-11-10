# redes/dns

Atrasos de ida (ms): Lia↔resolvedor 1, resolvedor↔raiz 10, ↔TLD 15, ↔autoritativo 8.
Primeira consulta: 2 × (1 + 10 + 15 + 8) = 68 ms. Cada ida e volta: raiz 20, TLD 30, autoritativo 16.
Segunda consulta aos 60 s: só Lia↔resolvedor, 2 ms; TTL restante 300 − 60 = 240 s.
Laboratório: com `depois` ≥ TTL a entrada expirou e a consulta refaz o caminho completo.
Mensagens DNS montadas byte a byte (sem compressão de nomes); checksums UDP conferidos no teste.

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
