# Revisão: so/estouro-de-buffer

Quadro: buf[0..3], buf[4..7], canário, quadro anterior, retorno (5 palavras de 4 bytes). Buffer = 8 bytes.

| Entrada | Palavras | Além | Sem canário | Com canário |
|---|---|---|---|---|
| 1–8 | 1–2 | 0 | ok | ok |
| 9–12 | 3 | 1–4 | latente | abortado |
| 13–16 | 4 | 5–8 | quebra | abortado |
| 17–24 | 5 | 9–16 | desvio | abortado |

Padrão: 20 bytes, sem canário → 12 além, 5 palavras, desvio.

## Para o dono conferir

- [x] Nenhum passo descreve conteúdo de entrada maliciosa nem técnica utilizável; só consequência.
- [x] Há passo de sinais (s6) e de defesa (s7).
- [x] A referência ao worm de 1988 está correta (estouro no fingerd).
