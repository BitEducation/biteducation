# so/rpc

- deposita = procedimento 3; conta 4242 = 0x1092; valor 100 = 0x64. Em 32 bits big-endian:
  00 00 00 03 | 00 00 10 92 | 00 00 00 64 (12 bytes).
- Custo remoto: 2 × 2 (empacotar dos dois lados) + 400 (ida e volta) + 3 (servidor) = 407 µs.
  Local 0,005 µs → 407 / 0,005 = 81 400 vezes.
- Resposta 1 perdida, saldo inicial 500, depósito 100:
  pelo menos uma vez → executa 2 vezes → 700; no máximo uma vez → executa 1 vez → 600.
- Quiz s3: 2 × 2 + 400 + 3 = 407 µs. Laboratório: entre cidades, 4 + 30000 + 3 = 30007 µs; mesmo rack, 57 µs.

Para o dono conferir:

- [x] MOS 8.2.4 (RPC) e CN 6.4.2 (chamada de procedimentos remotos).
- [x] Ordens de grandeza: chamada local ~ns; ida e volta num datacenter ~centenas de µs.
