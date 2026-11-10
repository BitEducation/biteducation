# so/impasses

Grafo (uma unidade de cada recurso): P1 → scanner → P2 → impressora → P1 é um ciclo, logo impasse.
Com a regra "impressora antes do scanner", P2 espera a impressora sem segurar nada; não há ciclo.

Banqueiro com um tipo de recurso, 10 unidades no total, 3 livres:

| Processo | Tem | Máximo | Precisa |
|---|---|---|---|
| A | 3 | 9 | 6 |
| B | 2 | 4 | 2 |
| C | 2 | 7 | 5 |

Estado seguro: livres 3 → B termina (precisa 2) e devolve 2 → 5 → C (5) → 7 → A (6) → 10.
Ordem B, C, A. Quiz do passo 4: depois de B, 5 livres.

Pedidos (passo 5, Laboratório):

- A + 1: livres 2; B termina → 4; A precisa 5 e C precisa 5: inseguro, A espera (padrão).
- B + 1: livres 2; B precisa 1 → 5 → C → 7 → A: seguro, atende.
- B + 2: livres 1; B precisa 0 → 5 → C → 7 → A: seguro, atende.
- B + 3: passa do máximo declarado (2 + 3 > 4): recusado.
- C + 1: livres 2; B → 4; C precisa 4 → 7; A: seguro, atende.
- C + 2: livres 1; ninguém cabe (B precisa 2): inseguro.
- A + 2, A + 3, C + 3: inseguros pelo mesmo raciocínio.

Para o dono conferir:

- [x] MOS 6.2, 6.5 e 6.6; Maziero cap. 13;
- [x] o nome "condições de Coffman" é o usado na disciplina.
