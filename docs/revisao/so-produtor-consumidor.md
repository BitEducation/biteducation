# so/produtor-consumidor

Buffer de 4, 8 itens, semáforos vazias = 4, cheias = 0, mutex = 1. Cada item do produtor
são 6 micro-operações (produz, P(vazias), P(mutex), insere, V(mutex), V(cheias)); o
consumidor também usa 6 (P(cheias), P(mutex), retira, V(mutex), V(vazias), consome).
Rodízio: o consumidor começa, com 6 micro-operações por vez, e o produtor tem 12. Um V acorda o
primeiro da fila do semáforo, e quem acorda já sai com o P completo.

Ordem correta: os 8 itens saem na ordem em que entraram, a ocupação máxima é 4 e o produtor
chega a dormir em P(vazias) (passo 5).

Ordem errada no produtor (P(mutex) antes de P(vazias)):

| Vez | Quem | O que acontece | Consumidos |
|---|---|---|---|
| 1 | C | P(cheias) com 0: dorme | 0 |
| 2 | P | i1 (acorda C), i2 | 0 |
| 3 | C | retira i1, P(cheias) ok | 1 |
| 4 | P | i3, i4 | 1 |
| 5 | C | retira i2 | 2 |
| 6 | P | i5, i6: buffer cheio (i3–i6) | 2 |
| 7 | C | retira i3 | 3 |
| 8 | P | i7 (vazias 1 → 0); i8: pega o mutex e dorme em P(vazias) | 3 |
| 9 | C | P(mutex): dorme. **Deadlock** | 3 |

Resultado: 3 de 8 itens consumidos, produtor esperando vazias, consumidor esperando mutex.

Para o dono conferir:

- [x] a versão do problema e a ordem dos P/V conferem com o Tanenbaum MOS (seção 2.3.5) e com o OSTEP (cap. 31).
