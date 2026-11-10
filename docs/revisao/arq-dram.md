# Revisão: arq/dram

Padrão: CL = 4, tRCD = 4, tRP = 4 ciclos. 8 leituras por padrão; bancos começam fechados.

- Primeira leitura (banco fechado): tRCD + CL = 8.
- Sequencial (linha 5, colunas 0–7): 8 + 7 × 4 = 36. 7 acertos.
- Mesmo banco, alternando linha 5 (a) e linha 9 (b): 8 + 7 × (4 + 4 + 4) = 92. 7 conflitos.
- Dois bancos (a no banco 0, b no banco 1): 8 + 8 + 6 × 4 = 40. 6 acertos, 0 conflitos.
- Pior ÷ melhor: 92 / 36 = 2,56 → "2,6".

## Para o dono conferir

- [x] Os nomes dos comandos (ACT, READ, PRE) e dos tempos (CL, tRCD, tRP) estão corretos.
- [x] A afirmação de refresh a cada 64 ms vale para DDR3/DDR4/DDR5 em temperatura normal.
- [x] No Lab, 1-1-1 e 8-8-8 dão textos coerentes.
