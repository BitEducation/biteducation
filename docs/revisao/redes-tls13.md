# redes/tls13

- ClientHello: 207 bytes (registro), com SNI, supported_versions (0x0304), supported_groups,
  signature_algorithms, ALPN e key_share X25519 de 32 bytes. Um parser independente em
  `src/sim/net/net.test.ts` confere a estrutura.
- ServerHello: 127 bytes, suíte TLS_AES_128_GCM_SHA256.
- Registro de dados: o mesmo pedido de 110 bytes da lição de encapsulamento + 1 byte de tipo
  de conteúdo + tag de 16 bytes = 127 bytes cifrados + cabeçalho de 5 = 132 bytes no fio.
- O que vaza: IPs, SNI (sem ECH), tamanhos e horários.

Para o dono conferir:

- [x] a ordem das mensagens do handshake contra a RFC 8446 (seção 2);
- [x] o texto sobre a cadeia de certificados contra o Kurose & Ross (cap. 8).
