# redes/encapsulamento

- Pedido HTTP (`src/sites/redes/plan.ts`, `PAGE_REQUEST`): 110 bytes.
- + TCP 20 = 130; + IP 20 = 150; + Ethernet 14 = **164 bytes** (sem preâmbulo nem FCS).
- 164 × 8 = 1312 bits.
- TTL 64 na saída; dois roteadores (campus e provedor): chega com 62.
- EtherType 0x0800 (IPv4); Protocolo 6 (TCP); porta de destino 80.
- A lição não faz NAT (dito no texto e nas simplificações): com o IP privado 10.20.0.42, o
  roteador do campus trocaria a origem por um IP público na prática.
- Os checksums de IP e TCP são calculados pelo `sim/net/checksum.ts` (testado contra os
  exemplos da RFC 1071).

Para o dono conferir:

- [x] nomes das camadas e das unidades (quadro, datagrama, segmento) contra o Kurose & Ross e o Tanenbaum CN.
