# redes/dnssec

Algoritmo 13 (ECDSA P-256 com SHA-256). As etiquetas de chave (24882, 11678, 19780, 22406,
21289, 48638) são sorteadas pela semente, não calculadas de chaves reais (simplificação listada).
Cadeia: RRSIG(A) pela ZSK → DNSKEY assinado pela KSK → DS no pai → … → âncora da raiz (quiz).
Laboratório `forjar`: resposta com 203.0.113.66 sem assinatura válida → SERVFAIL.

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
