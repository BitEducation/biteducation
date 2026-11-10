# redes/webrtc

Lia 10.20.0.42:50100 vista pelo STUN como 198.51.100.7:40050; Ana 203.0.113.140:61010.
Pedido STUN de 20 bytes (cabeçalho, cookie 0x2112A442); XOR-MAPPED-ADDRESS conferido no teste:
40050 = 0x9C72 ⊕ 0x2112 = 0xBD60; C6 33 64 07 ⊕ 21 12 A4 42 = E7 21 C0 45. Laboratório `simetrico`: a porta muda por destino, os testes
ICE falham e a mídia vai pelo TURN.

Para o dono conferir:

- [x] capítulo e seção do Tanenbaum e os RFCs citados em `refs`;
- [x] a lição inteira em `npm run dev`, com e sem o Laboratório.
