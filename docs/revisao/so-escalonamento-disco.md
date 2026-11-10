# so/escalonamento-disco

Cilindros 0 a 199, cabeça no 70, subindo. Fila: 120 15 160 62 90 30 185 80.

FCFS: 70 → 120 → 15 → 160 → 62 → 90 → 30 → 185 → 80.
50 + 105 + 145 + 98 + 28 + 60 + 155 + 105 = 746.

SSTF: do 70, o 62 (8) ganha do 80 (10). Do 62, o 80 (18) ganha do 30 (32). Depois 90, 120, 160, 185 e, sem nada
acima, 30 e 15. 8 + 18 + 10 + 30 + 40 + 25 + 155 + 15 = 301. Quiz do passo 3: 62.

SCAN subindo: 70 → … → 185 → 199 → 62 → 30 → 15. (199 − 70) + (199 − 15) = 129 + 184 = 313. Quiz do passo 4: 313.

LOOK: vira no 185. (185 − 70) + (185 − 15) = 115 + 170 = 285 (o menor dos seis; o SSTF guloso faz 301).

C-SCAN: 70 → … → 199 (129), retorno até 0 (199), depois 15, 30, 62 (62). 129 + 199 + 62 = 390.

C-LOOK: 70 → 185 (115), salto até 15 (170), depois 30 e 62 (47). 115 + 170 + 47 = 332.

O teste confere que todo algoritmo atende cada pedido uma vez só, inclusive com pedidos repetidos e nas bordas, nos
dois sentidos.

Para o dono conferir:

- [x] MOS 5.4.3; Maziero 21.1.2;
- [x] a convenção de contar o retorno do C-SCAN (alguns livros não contam).
