# so/virtualizacao

Instruções do convidado: add roda direto; cli, mov cr3 e out são privilegiadas e geram armadilha;
popf é sensível e não privilegiada: falha calada (1).

- Custo: 5 sensíveis a cada 10 000, 1000 ciclos por armadilha: (10 000 + 5000) ÷ 10 000 = 1,5× (quiz).
- Paginação aninhada com 4 níveis no convidado e 4 no hospedeiro: cada nível do convidado custa
  4 leituras do hospedeiro + 1 da entrada = 5; 4 × 5 = 20; mais 4 para o endereço final = 24 (quiz).
  (n + 1)(m + 1) − 1 = 5 × 5 − 1 = 24. Nativo: 4. Tabelas-sombra: 4 por falta, mais armadilhas nas escritas.

Extremos: 0 sensíveis → 1×; 50 → 6×; 5 níveis → 35; 2 níveis → 8.

Para o dono conferir:

- [x] MOS 7.2 e 7.6; Maziero 33.
