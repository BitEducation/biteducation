# redes/wireguard

Padrão: 1200 bytes de dados, MTU do túnel 1420, AllowedIPs do notebook = 10.8.0.1/32 e 192.168.1.0/24.

Encapsulamento (passo 3):

- MSS = 1420 − 40 = 1380 ≥ 1200: um segmento só. Pacote interno = 20 (IPv4) + 20 (TCP) + 1200 = 1240.
- Enchimento até múltiplo de 16 sem passar da MTU: 1240 / 16 = 77,5 → 78 × 16 = 1248 (8 bytes de enchimento).
- Mensagem de dados = 16 (tipo 4 + índice 4 + contador 8) + 1248 + 16 (tag Poly1305) = 1280.
- UDP 8 → 1288; IPv4 externo 20 → 1308 (quiz). Sobrecarga 1308 − 1240 = 68.

MTU (passo 4): um pacote interno cheio (1420) não leva enchimento.

- IPv4 por fora: 1420 + 20 + 8 + 32 = 1480 ≤ 1500; IPv6: 1420 + 40 + 8 + 32 = 1500 ≤ 1500. MTU segura = 1500 − 80 = 1420; MSS 1380.
- Extremos: MTU 1500 → 1560 (não cabe nem em IPv4); MTU 1440 → 1500 em IPv4 (cabe), 1520 em IPv6 (não cabe).

AllowedIPs (passo 5): 192.168.1.10 casa com 192.168.1.0/24 → túnel; 203.0.113.80 não casa → direto
(com 0.0.0.0/0 → túnel). Pacote do peer C (AllowedIPs 10.8.0.3/32) com origem 10.8.0.2 → descartado.

Tamanhos fixos do protocolo: iniciação 148 bytes, resposta 92, rekey após 120 s, rejeição após 180 s.

Para o dono conferir:

- [x] Tanenbaum CN 8.10.2 (VPN); artigo do WireGuard (seções de mensagens, roteamento por chave e temporizadores).
