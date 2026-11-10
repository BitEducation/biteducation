# redes/udp

Pacotes a cada 20 ms, atraso 30 ms, buffer 60 ms: o pacote k toca em 30 + 60 + 20(k − 1) = 90 + 20(k − 1).
Padrão: 8 pacotes, perdido o 3, atrasado o 6 em +100 ms: chega em 100 + 30 + 100 = 230 ms, mas devia
tocar em 190 ms, então é descartado. Cabeçalho UDP 8 bytes; checksum com pseudocabeçalho no teste.
Laboratório: perdido e atrasado nunca são o mesmo pacote; mínimo de 2 pacotes.

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
