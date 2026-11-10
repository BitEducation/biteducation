# redes/sub-redes

192.168.10.77/26.

- 77 = 0100 1101. Máscara /26: 26 uns → último octeto 1100 0000 = 192 → 255.255.255.192.
- AND: 0100 1101 AND 1100 0000 = 0100 0000 = 64 → rede 192.168.10.64.
- Broadcast: bits de host em 1 → 0111 1111 = 127 → 192.168.10.127.
- 32 − 26 = 6 bits de host: 2^6 = 64 endereços, 62 úteis (.65 a .126). Quiz: 62.

Divisão: /24 em 4 × /26 (2 bits emprestados): .0, .64, .128, .192. 77 está em .64–.127 → sub-rede 2. Quiz: 2.

VLSM em 192.168.10.0/24, pedidos 100, 50, 20, 2:

- 100 → menor p com 2^(32−p) − 2 ≥ 100: /25 (126). Bloco .0/25.
- 50 → /26 (62). Próximo alinhado a 64: .128/26.
- 20 → /27 (30). .192/27.
- 2 → /30 (2). .224/30.
- Usados 128 + 64 + 32 + 4 = 228; livres 28.

Prefixo mais longo: 0.0.0.0/0, 192.168.0.0/16, 192.168.10.0/24, 192.168.10.64/28 (.64–.79).
.77 casa com as 4; vence /28 (laboratório). Quiz: 28. .80 (= 64 XOR 16) fica fora da /28 → /24 (prédio).

Laboratório 10.0.0.1/8: rede 10.0.0.0, broadcast 10.255.255.255, 2^24 − 2 = 16.777.214 hosts;
bloco pai /6 = 8.0.0.0/6, sub-redes 8, 9, 10, 11 → 10.0.0.0/8 é a 3ª.

Para o dono conferir:

- [x] Tanenbaum CN 5.7.2.
