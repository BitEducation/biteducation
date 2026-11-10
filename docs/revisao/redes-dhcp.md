# redes/dhcp

Concessão 3600 s; T1 = 50% = 1800 s (RFC 2131 §4.4.5). DISCOVER de 0.0.0.0:68 para
255.255.255.255:67; REQUEST continua em broadcast para avisar os outros servidores (resposta do quiz).
Sonda ARP com IP de origem 0.0.0.0 (RFC 5227) antes de usar o endereço. Renovação em unicast no T1.
Campos BOOTP, cookie mágico 99.130.83.99 e opções 53/50/54/51/1/3/6 conferidos no teste.

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
