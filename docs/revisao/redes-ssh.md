# redes/ssh

Versões SSH-2.0; KEXINIT com curve25519-sha256, ssh-ed25519, chacha20-poly1305@openssh.com.
Chaves efêmeras de 32 bytes, assinatura Ed25519 de 64 bytes; NEWKEYS = 21. Pacotes com enchimento
até múltiplo de 8 e mínimo de 4 bytes (RFC 4253 §6); o múltiplo de 8 é conferido no teste. Laboratório: com
`trocada` a lição para no aviso de chave diferente (5 passos). A impressão digital é ilustrativa.

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
