# redes/ipsec

ESP com AES-GCM: cabeçalho 8 (SPI 4 + sequência 4), IV 8, ICV 16; fim 2; carga + enchimento + 2
múltiplo de 4.

- Túnel: carga 1400; 1402 → enchimento 2 → 1404. Total 20 + 8 + 8 + 1404 + 16 = 1456 (+56, 4%).
- Transporte: carga 1380; 1382 → enchimento 2 → 1384. Total 20 + 8 + 8 + 1384 + 16 = 1436 (+36).
- Janela 64: 1, 2, 3, 5 aceitos; 4 aceito (dentro); 4 repetido; 70 aceito (topo 70);
  6: 6 + 64 = 70 ≤ 70 → velho demais; 71 aceito.
- NAT-T: túnel + 8 bytes de UDP → 1464. Quiz s3: 36 a mais no transporte.
- Maior pacote em 1500: 54 + n + enchimento + 8 ≤ 1500 com (n + 2) múltiplo de 4 → n = 1438, total 1500 (quiz s5).

Para o dono conferir:

- [x] CN 8.10.1 (IPsec); RFC 4303 seções 2 e 3.4.3; RFC 4106; RFC 3948 (UDP 4500).
