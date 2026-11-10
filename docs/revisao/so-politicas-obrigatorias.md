# Revisão: so/politicas-obrigatorias

Níveis 0 público < 1 confidencial < 2 secreto. Sujeitos: estagiário 0, analista 1, diretora 2. Objetos: cardápio 0, relatório 1, plano 2.

- BLP ler (s ≥ o): 1 + 2 + 3 = 6 de 9. Analista lê cardápio e relatório.
- BLP escrever (s ≤ o): 3 + 2 + 1 = 6 de 9. Analista escreve em relatório e plano. Diretora só no plano → cavalo de Troia bloqueado.
- Biba ler (s ≤ o): 6 de 9. Analista lê relatório e plano; escreve em cardápio e relatório.

## Para o dono conferir

- [x] Descrição de SELinux, AppArmor e níveis de integridade do Windows.
