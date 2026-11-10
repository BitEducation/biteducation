# redes/congestionamento

Capacidade 24 segmentos por RTT, ssthresh inicial 16, 40 RTTs. Perda quando cwnd > 24 (detectada por 3 ACKs
duplicados); entregues por RTT = min(cwnd, 24).

Reno:

- RTT 0–4: 1, 2, 4, 8, 16 (limiar em 4 RTTs, quiz: 4).
- RTT 5–13: 17 … 25. RTT 13: 25 > 24 → perda. ssthresh = cwnd = ⌊25/2⌋ = 12 (quiz: 12).
- RTT 14–27: 12 … 25; perda em 27; RTT 28–39: 12 … 23.
- Entregues: 15 + (16+…+24 = 180) + 24 + (12+…+24 = 234) + 24 + (12+…+23 = 210) = 687.

Tahoe: igual até 13; depois cwnd = 1 e partida lenta até 12:

- RTT 14–17: 1, 2, 4, 8; 18: 12 (limitado ao limiar); 19–31: 13 … 25, perda em 31.
- RTT 32–35: 1, 2, 4, 8; 36–39: 12, 13, 14, 15.
- Entregues: 219 + 15 + 234 + 24 + 15 + 54 = 561. Diferença 126.

Justiça (AIMD), dois fluxos 20 e 2, gargalo 24: perda quando a soma passa de 24; ambos caem à metade.
20/2 → 21/3 → 22/4 (26, perda) → 11/2 … diferença 18 → 9 → 4 … → 0 no fim dos 40 RTTs.

Laboratório: capacidade 12, ssthresh 32 → 1, 2, 4, 8, 16: perda no RTT 4 ainda na partida lenta (quiz muda
para "em que RTT passa de 12?": 4).

Para o dono conferir:

- [x] Tanenbaum CN 6.5.10 e 6.3.2.
