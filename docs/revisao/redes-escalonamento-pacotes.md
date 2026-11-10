# redes/escalonamento-pacotes

Enlace 1 byte/µs. Backup B1–B6 de 1500 B em t = 0; voz V1–V4 de 200 B em 0,1; 2,1; 4,1; 6,1 ms.

- FIFO: B1–B6 ocupam 0–9 ms; V1 sai 9,0–9,2 → atraso 9,1 ms (pior).
- Fila justa (SCFQ): etiquetas B = 1500, 3000, …; V1 chega com V(t) = 1500 (B1 em serviço) →
  1700 < 3000 → sai após B1: 1,5–1,7 ms, atraso 1,6. V2 (2,1) etiqueta 3200+... sai 3,2–3,4 (1,3);
  V3 4,9–5,1 (1,0); V4 6,6–6,8 (0,7). Pior 1,6 ms. Backup termina em 9,8 ms.
- Prioridade estrita: mesma ordem (sem preempção), pior 1,6 ms.
- Quiz s3 (prioridade): V1 espera B1 até 1,5 ms e sai em 0,2 ms: 1,5 − 0,1 + 0,2 = 1,6 ms.
- Backup em 18 pedaços de 500 B: V1 espera até 0,5 ms: 0,5 − 0,1 + 0,2 = 0,6 ms. Cabeçalhos extras: 12 × 40 = 480 bytes.
- Laboratório: pacote de 600 B → prioridade 0,6 − 0,1 + 0,2 = 0,7 ms.

Para o dono conferir:

- [x] CN 5.4.3 (escalonamento de pacotes, fila justa e WFQ) e 5.4.5 (serviços diferenciados); RFC 3246 (EF, DSCP 46).
