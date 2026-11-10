# Revisão: arq/numa

2 nós; T0, T1 no nó 0; T2, T3 no nó 1. 8 páginas, 2 por thread (T0: 0–1, T1: 2–3, T2: 4–5, T3: 6–7). Local 80 ns, remota 140 ns (padrão).

- Pela principal: todas no nó 0 → T0, T1 = 80; T2, T3 = 140 → média (80 + 80 + 140 + 140) ÷ 4 = 110; pior 140.
- Em paralelo: 0–3 no nó 0, 4–7 no nó 1 → todas locais → 80.
- Intercaladas (p % 2): cada thread tem 1 local e 1 remota → 110 cada → média 110, pior 110.

## Para o dono conferir

- [x] Linux e Windows usam primeiro toque como padrão.
