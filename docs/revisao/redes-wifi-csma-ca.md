# Revisão: redes/wifi-csma-ca

Tempos 802.11a/g: slot 9 µs, SIFS 16 µs, DIFS = 16 + 2 × 9 = 34 µs. Taxa 54 Mb/s, preâmbulo 20 µs.

- Quadro de 1500 B: 20 + 12.000 ÷ 54 = 242,2 µs. ACK (14 B): 20 + 112 ÷ 54 = 22,1. RTS (20 B): 23,0. CTS (14 B): 22,1.
- Sem reserva: DIFS + dados + SIFS + ACK = 34 + 242,2 + 16 + 22,1 = 314,3 µs.
- Com reserva: + RTS + SIFS + CTS + SIFS = 314,3 + 23,0 + 16 + 22,1 + 16 = 391,3 µs.
- Custo extra 77,0 µs; colisão perde 242,2 sem reserva e 23,0 com → economiza 219,3 > 77,0: compensa.
- Recuo: A = 3, B = 5 → A transmite após 3 slots; B congela em 5 − 3 = 2.

## Para o dono conferir

- [x] Tempos do 802.11a/g (slot, SIFS, DIFS) conferidos.
