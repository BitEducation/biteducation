# redes/dns-poisoning

Simulação de probabilidades; nenhum pacote é montado. Nomes e endereços de documentação
(banco.example, 192.0.2.53, 203.0.113.10, 198.51.100.66).

- Espaço do ID: 2^16 = 65536. Com 100 palpites distintos por corrida, p = 100/65536 = 0,153%.
- Corridas esperadas: 1/p = 655,36 → 655. Quiz: 655.
- Sem nomes inventados, uma corrida por TTL: 655 × 3600 s ≈ 27,3 dias.
- Com nomes novos a 20 corridas/s: 655 × 0,05 s ≈ 33 s; a semente 53 sorteou o acerto na corrida 808 (40 s).
- 50%: menor k com 1 − (1 − p)^k ≥ 0,5 → k = ⌈ln 0,5 / ln(1 − p)⌉ = ⌈453,9⌉ = 454.
- Respostas com ID errado até o acerto: 808 × 100 − 1 = 80 799.
- Porta aleatória (28 232 portas): p' = p / 28 232 → 1/p' = 65536 × 28232 / 100 = 18 502 123,5 → 18.502.124
  corridas; a 20/s ≈ 925 106 s ≈ 10,7 dias.

Passos de sinais (s5, tag signals) e defesa (s6, tag defense) presentes. Sem comandos nem ferramentas.

Para o dono conferir:

- [x] Tanenbaum CN 8.2.3 e 8.12.2.
