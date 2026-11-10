# redes/amplificacao

Aritmética de banda; nenhum pacote é montado. Tamanhos ilustrativos (ordens de grandeza).

- DNS aberto: pedido 60 B, resposta 3000 B → fator 3000/60 = 50. Quiz: 50.
- NTP (comando de monitoramento antigo): 48 B → 26 400 B → fator 550.
- 100 Mbit/s de pedidos forjados × 50 = 5000 Mbit/s = 5 Gbit/s na vítima; enlace de 1 Gbit/s → 5× (500%).
  Quiz: 5000.
- Limite de 5 respostas/s por destino em 2000 refletores: 2000 × 5 × 3000 B × 8 = 240 Mbit/s (24% do enlace).
- Laboratório NTP, 1000 Mbit/s, enlace 100 Mbit/s: 550 Gbit/s, 5500× o enlace; com limite:
  2000 × 5 × 26 400 × 8 = 2112 Mbit/s, ainda acima do enlace (texto e estado tratam o caso).

Passos de sinais (s4) e defesa (s5, s6) presentes. Sem comandos nem ferramentas.

Para o dono conferir:

- [x] Tanenbaum CN 8.2.4 (reflexão e amplificação em DDoS).
