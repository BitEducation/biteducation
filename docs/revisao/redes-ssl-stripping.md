# redes/ssl-stripping

Modelo de decisão do navegador; nenhum tráfego. Domínio de documentação (banco.example).

Regra: o primeiro pedido sai em HTTPS só se o domínio está na pré-carga ou se o servidor usa HSTS e o
navegador já guardou a regra numa visita anterior. Caso contrário sai em HTTP e pode ser rebaixado.

| HSTS | visitou | pré-carga | primeiro pedido | vulnerável |
|------|---------|-----------|-----------------|------------|
| sim  | não     | não       | http            | sim (padrão) |
| sim  | sim     | não       | https           | não |
| não  | sim     | não       | http            | sim |
| não  | não     | sim       | https           | não |

max-age: 365 dias × 86 400 s = 31 536 000. Quiz: 31 536 000 / 86 400 = 365. Laboratório 1 dia: 86 400 → 1.

Passos de sinais (s4) e defesa (s5, s6) presentes. Sem comandos nem ferramentas.

Para o dono conferir:

- [x] Tanenbaum CN 8.12.3 e 8.2.2 (o livro cita HSTS só de passagem, em 7.3.5).
