# redes/nat

Lia 10.20.0.42:51034 → 198.51.100.7:40001; Malu 10.20.0.66:51034 (mesma porta) → :40002.
Volta para :40002 vai para a Malu (quiz). Entrada sem tradução (:22) é descartada; regra fixa
:443 → 10.20.0.80:8443. Checksums IP e TCP recalculados após a tradução, conferidos no teste.

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
